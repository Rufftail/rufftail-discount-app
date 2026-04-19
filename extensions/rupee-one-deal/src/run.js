import { DiscountApplicationStrategy } from "../generated/api";

export const DEFAULT_THRESHOLD = 2999;
export const ONE_RUPEE_FINAL_PRICE = 1.0;
export const MAX_OFFER_UNIT_PRICE = 600;
export const OFFER_TYPE_ATTRIBUTE = "unlock_offer";
export const DEAL_MESSAGE = "Rs 1 Deal";

function emptyDiscountResult() {
  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [],
  };
}

function getLineSubtotal(line) {
  return Number(line.cost?.subtotalAmount?.amount ?? 0);
}

function getLineUnitPrice(line) {
  return Number(line.cost?.amountPerQuantity?.amount ?? 0);
}

function parseConfiguration(input) {
  const config = input.discountNode?.metafield?.jsonValue;

  if (!config || typeof config !== "object") {
    return {
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      collectionId: "",
      maxOfferPrice: MAX_OFFER_UNIT_PRICE,
    };
  }

  return {
    enabled: config.enabled ?? true,
    threshold: Number(config.threshold ?? DEFAULT_THRESHOLD),
    collectionId: String(config.collectionId ?? ""),
    maxOfferPrice: Number(config.maxOfferPrice ?? MAX_OFFER_UNIT_PRICE),
  };
}

function matchesConfiguredCollection(line, collectionId) {
  if (!collectionId) {
    return false;
  }

  const markedCollectionId = line.offerCollectionId?.value?.trim();
  return markedCollectionId === collectionId;
}

/**
 * Unlock exactly one marked offer item for Rs 1 once the rest of the cart
 * reaches the qualifying subtotal threshold.
 *
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function run(input) {
  const lines = input.cart?.lines ?? [];
  const config = parseConfiguration(input);

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

  if (!offerLines.length) {
    return emptyDiscountResult();
  }

  const qualifyingSubtotal = lines
    .filter((line) => line.offerType?.value !== OFFER_TYPE_ATTRIBUTE)
    .reduce((sum, line) => sum + getLineSubtotal(line), 0);

  if (qualifyingSubtotal < config.threshold) {
    return emptyDiscountResult();
  }

  const offerLine = offerLines.find(
    (line) =>
      getLineUnitPrice(line) > ONE_RUPEE_FINAL_PRICE &&
      getLineUnitPrice(line) <= config.maxOfferPrice,
  );

  if (!offerLine) {
    return emptyDiscountResult();
  }

  const discountAmount = getLineUnitPrice(offerLine) - ONE_RUPEE_FINAL_PRICE;

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
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
  };
}
