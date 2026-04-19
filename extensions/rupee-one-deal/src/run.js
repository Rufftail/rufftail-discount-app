import { DiscountApplicationStrategy } from "../generated/api";

export const QUALIFYING_SUBTOTAL_THRESHOLD = 2999;
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

/**
 * Unlock exactly one marked offer item for Rs 1 once the rest of the cart
 * reaches the qualifying subtotal threshold.
 *
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function run(input) {
  const lines = input.cart?.lines ?? [];

  if (!lines.length) {
    return emptyDiscountResult();
  }

  const offerLines = lines.filter(
    (line) =>
      line.offerType?.value === OFFER_TYPE_ATTRIBUTE &&
      line.merchandise?.__typename === "ProductVariant" &&
      line.quantity > 0,
  );

  if (!offerLines.length) {
    return emptyDiscountResult();
  }

  const qualifyingSubtotal = lines
    .filter((line) => line.offerType?.value !== OFFER_TYPE_ATTRIBUTE)
    .reduce((sum, line) => sum + getLineSubtotal(line), 0);

  if (qualifyingSubtotal < QUALIFYING_SUBTOTAL_THRESHOLD) {
    return emptyDiscountResult();
  }

  const offerLine = offerLines.find(
    (line) =>
      getLineUnitPrice(line) > ONE_RUPEE_FINAL_PRICE &&
      getLineUnitPrice(line) <= MAX_OFFER_UNIT_PRICE,
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
