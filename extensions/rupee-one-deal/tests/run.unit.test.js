import { describe, expect, test } from "vitest";
import {
  DEAL_MESSAGE,
  ONE_RUPEE_FINAL_PRICE,
  QUALIFYING_SUBTOTAL_THRESHOLD,
  run,
} from "../src/run.js";

function createCartLine({
  id,
  quantity = 1,
  subtotal,
  unitPrice,
  offerType = null,
}) {
  return {
    id,
    quantity,
    offerType: offerType ? { value: offerType } : null,
    cost: {
      subtotalAmount: {
        amount: String(subtotal),
        currencyCode: "INR",
      },
      amountPerQuantity: {
        amount: String(unitPrice),
        currencyCode: "INR",
      },
    },
    merchandise: {
      __typename: "ProductVariant",
      id: `gid://shopify/ProductVariant/${id}`,
      title: `Variant ${id}`,
      product: {
        id: `gid://shopify/Product/${id}`,
      },
    },
  };
}

describe("rupee one deal function", () => {
  test("returns no discount when the non-offer subtotal is below Rs 2999", () => {
    const result = run({
      cart: {
        lines: [
          createCartLine({
            id: "qualifying-line",
            subtotal: QUALIFYING_SUBTOTAL_THRESHOLD - 1,
            unitPrice: QUALIFYING_SUBTOTAL_THRESHOLD - 1,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 499,
            unitPrice: 499,
            offerType: "unlock_offer",
          }),
        ],
      },
    });

    expect(result.discounts).toEqual([]);
  });

  test("discounts one marked offer item down to Rs 1 once threshold is met", () => {
    const offerUnitPrice = 499;
    const result = run({
      cart: {
        lines: [
          createCartLine({
            id: "qualifying-line",
            subtotal: QUALIFYING_SUBTOTAL_THRESHOLD,
            unitPrice: QUALIFYING_SUBTOTAL_THRESHOLD,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: offerUnitPrice,
            unitPrice: offerUnitPrice,
            quantity: 2,
            offerType: "unlock_offer",
          }),
        ],
      },
    });

    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0]).toEqual({
      message: DEAL_MESSAGE,
      targets: [
        {
          cartLine: {
            id: "offer-line",
            quantity: 1,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: (offerUnitPrice - ONE_RUPEE_FINAL_PRICE).toFixed(2),
          appliesToEachItem: true,
        },
      },
    });
  });

  test("does not count the offer item itself toward the threshold", () => {
    const result = run({
      cart: {
        lines: [
          createCartLine({
            id: "qualifying-line",
            subtotal: 2000,
            unitPrice: 2000,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 2000,
            unitPrice: 2000,
            offerType: "unlock_offer",
          }),
        ],
      },
    });

    expect(result.discounts).toEqual([]);
  });

  test("skips the discount when the offer product is already priced at Rs 1 or less", () => {
    const result = run({
      cart: {
        lines: [
          createCartLine({
            id: "qualifying-line",
            subtotal: QUALIFYING_SUBTOTAL_THRESHOLD + 500,
            unitPrice: QUALIFYING_SUBTOTAL_THRESHOLD + 500,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 1,
            unitPrice: 1,
            offerType: "unlock_offer",
          }),
        ],
      },
    });

    expect(result.discounts).toEqual([]);
  });
});
