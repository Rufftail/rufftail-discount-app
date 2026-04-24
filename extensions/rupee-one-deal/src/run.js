export const DEFAULT_THRESHOLD = 2999;
export const ONE_RUPEE_FINAL_PRICE = 1.0;
export const MAX_OFFER_UNIT_PRICE = 600;
export const OFFER_TYPE_ATTRIBUTE = "unlock_offer";
export const DEAL_MESSAGE = "Rs 1 Deal";
export const SAVE5_CODE = "SAVE5";
export const SAVE8_CODE = "SAVE8";
export const SAVE5_THRESHOLD = 6999;
export const SAVE8_THRESHOLD = 9999;
export const PRODUCT_SELECTION_STRATEGY = "FIRST";
export const ORDER_SELECTION_STRATEGY = "FIRST";

function emptyDiscountResult() {
  return {
    operations: [],
  };
}

function getLineSubtotal(line) {
  return Number(line.cost?.subtotalAmount?.amount ?? 0);
}

function getLineUnitPrice(line) {
  return Number(line.cost?.amountPerQuantity?.amount ?? 0);
}

function parseConfiguration(input) {
  const config = input.discount?.metafield?.jsonValue;

  if (!config || typeof config !== "object") {
    return {
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      collectionId: "",
      maxOfferPrice: MAX_OFFER_UNIT_PRICE,
      slabs: [
        { code: SAVE5_CODE, threshold: SAVE5_THRESHOLD, percentage: 5 },
        { code: SAVE8_CODE, threshold: SAVE8_THRESHOLD, percentage: 8 },
      ],
    };
  }

  return {
    enabled: config.enabled ?? true,
    threshold: Number(config.threshold ?? DEFAULT_THRESHOLD),
    collectionId: String(config.collectionId ?? ""),
    maxOfferPrice: Number(config.maxOfferPrice ?? MAX_OFFER_UNIT_PRICE),
    slabs: Array.isArray(config.slabs) && config.slabs.length
      ? config.slabs.map((slab) => ({
          code: String(slab.code ?? "").trim().toUpperCase(),
          threshold: Number(slab.threshold ?? 0),
          percentage: Number(slab.percentage ?? 0),
        }))
      : [
          { code: SAVE5_CODE, threshold: SAVE5_THRESHOLD, percentage: 5 },
          { code: SAVE8_CODE, threshold: SAVE8_THRESHOLD, percentage: 8 },
        ],
  };
}

function matchesConfiguredCollection(line, collectionId) {
  if (!collectionId) {
    return false;
  }

  const markedCollectionId = line.offerCollectionId?.value?.trim();
  return markedCollectionId === collectionId;
}

function getTriggeredSlab(config, triggeringDiscountCode, qualifyingSubtotal) {
  const normalizedCode = String(triggeringDiscountCode ?? "").trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const slab = config.slabs.find((candidate) => candidate.code === normalizedCode);

  if (!slab || slab.percentage <= 0 || qualifyingSubtotal < slab.threshold) {
    return null;
  }

  return slab;
}

/**
 * Apply the Rs 1 offer item discount and optional slab-based order discount
 * from the same Shopify Discount Function.
 *
 * @param {any} input
 * @returns {{operations: any[]}}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const lines = input.cart?.lines ?? [];
  const config = parseConfiguration(input);
  const discountClasses = input.discount?.discountClasses ?? [];
  const supportsProductDiscounts = discountClasses.includes("PRODUCT");
  const supportsOrderDiscounts = discountClasses.includes("ORDER");

  if (!config.enabled || !config.collectionId || !lines.length) {
    return emptyDiscountResult();
  }

  const offerLines = lines.filter(
    (line) =>
      line.offerType?.value === OFFER_TYPE_ATTRIBUTE &&
      matchesConfiguredCollection(line, config.collectionId) &&
      line.merchandise?.__typename === "ProductVariant" &&
      line.quantity > 0,
  );

  const qualifyingSubtotal = lines
    .filter((line) => line.offerType?.value !== OFFER_TYPE_ATTRIBUTE)
    .reduce((sum, line) => sum + getLineSubtotal(line), 0);

  const operations = [];
  const excludedOfferLineIds = offerLines.map((line) => line.id);

  if (supportsProductDiscounts && offerLines.length && qualifyingSubtotal >= config.threshold) {
    const offerLine = offerLines.find(
      (line) =>
        getLineUnitPrice(line) > ONE_RUPEE_FINAL_PRICE &&
        getLineUnitPrice(line) <= config.maxOfferPrice,
    );

    if (offerLine) {
      const discountAmount = getLineUnitPrice(offerLine) - ONE_RUPEE_FINAL_PRICE;

      operations.push({
        productDiscountsAdd: {
          selectionStrategy: PRODUCT_SELECTION_STRATEGY,
          candidates: [
            {
              message: DEAL_MESSAGE,
              targets: [
                {
                  cartLine: {
                    id: offerLine.id,
                    quantity: 1,
                  },
                },
              ],
              value: {
                fixedAmount: {
                  amount: discountAmount.toFixed(2),
                  appliesToEachItem: true,
                },
              },
            },
          ],
        },
      });
    }
  }

  if (supportsOrderDiscounts) {
    const slab = getTriggeredSlab(
      config,
      input.triggeringDiscountCode,
      qualifyingSubtotal,
    );

    if (slab) {
      operations.push({
        orderDiscountsAdd: {
          selectionStrategy: ORDER_SELECTION_STRATEGY,
          candidates: [
            {
              message: `${slab.code} ${slab.percentage}% Off`,
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: excludedOfferLineIds,
                  },
                },
              ],
              value: {
                percentage: {
                  value: slab.percentage,
                },
              },
            },
          ],
        },
      });
    }
  }

  return {
    operations,
  };
}

export const run = cartLinesDiscountsGenerateRun;
