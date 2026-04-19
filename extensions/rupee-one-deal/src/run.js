import { DiscountApplicationStrategy } from "../generated/api";

const THRESHOLD = 2999;
const FINAL_PRICE = 1.0;

/**
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function run(input) {
  const lines = input.cart?.lines ?? [];

  if (!lines.length) {
    return {
      discountApplicationStrategy: DiscountApplicationStrategy.First,
      discounts: [],
    };
  }

  const offerLines = lines.filter((line) => {
    return (
      line.offerType?.value === "unlock_offer" &&
      line.merchandise?.__typename === "ProductVariant"
    );
  });

  if (!offerLines.length) {
    return {
      discountApplicationStrategy: DiscountApplicationStrategy.First,
      discounts: [],
    };
  }

  const qualifyingSubtotal = lines
    .filter((line) => line.offerType?.value !== "unlock_offer")
    .reduce((sum, line) => {
      return sum + Number(line.cost?.subtotalAmount?.amount ?? 0);
    }, 0);

  if (qualifyingSubtotal < THRESHOLD) {
    return {
      discountApplicationStrategy: DiscountApplicationStrategy.First,
      discounts: [],
    };
  }

  const offerLine = offerLines[0];
  const unitPrice = Number(offerLine.cost?.amountPerQuantity?.amount ?? 0);

  if (unitPrice <= FINAL_PRICE) {
    return {
      discountApplicationStrategy: DiscountApplicationStrategy.First,
      discounts: [],
    };
  }

  const discountAmount = unitPrice - FINAL_PRICE;

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.First,
    discounts: [
      {
        message: "₹1 Steal Deal",
        targets: [
          {
            cartLine: {
              id: offerLine.id,
              quantity: 1
            }
          }
        ],
        value: {
          fixedAmount: {
            amount: discountAmount.toFixed(2),
            appliesToEachItem: true
          }
        }
      }
    ]
  };
}
