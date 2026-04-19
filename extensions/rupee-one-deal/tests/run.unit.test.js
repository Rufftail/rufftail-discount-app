import { describe, expect, test } from "vitest";
import {
  DEAL_MESSAGE,
  DEFAULT_THRESHOLD,
  MAX_OFFER_UNIT_PRICE,
  ONE_RUPEE_FINAL_PRICE,
  run,
} from "../src/run.js";

const ELIGIBLE_COLLECTION_ID = "gid://shopify/Collection/111";

function createInput(lines, config = {}) {
  return {
    discountNode: {
      metafield: {
        jsonValue: {
          enabled: true,
          threshold: DEFAULT_THRESHOLD,
          collectionId: ELIGIBLE_COLLECTION_ID,
          maxOfferPrice: MAX_OFFER_UNIT_PRICE,
          ...config,
        },
      },
    },
    cart: {
      lines,
    },
  };
}

function createCartLine({
  id,
  quantity = 1,
  subtotal,
  unitPrice,
  offerType = null,
  offerCollectionId = null,
}) {
  return {
    id,
    quantity,
    offerType: offerType ? { value: offerType } : null,
    offerCollectionId: offerCollectionId ? { value: offerCollectionId } : null,
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
  test("returns no discount when the non-offer subtotal is below the configured threshold", () => {
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: DEFAULT_THRESHOLD - 1,
          unitPrice: DEFAULT_THRESHOLD - 1,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: 499,
          unitPrice: 499,
          offerType: "unlock_offer",
          offerCollectionId: ELIGIBLE_COLLECTION_ID,
        }),
      ]),
    );

    expect(result.discounts).toEqual([]);
  });

  test("discounts one marked collection-matched offer item down to Rs 1 once threshold is met", () => {
    const offerUnitPrice = 499;
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: DEFAULT_THRESHOLD,
          unitPrice: DEFAULT_THRESHOLD,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: offerUnitPrice,
          unitPrice: offerUnitPrice,
          quantity: 2,
          offerType: "unlock_offer",
          offerCollectionId: ELIGIBLE_COLLECTION_ID,
        }),
      ]),
    );

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

  test("skips the discount when the theme does not send the collection marker", () => {
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: DEFAULT_THRESHOLD + 500,
          unitPrice: DEFAULT_THRESHOLD + 500,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: 499,
          unitPrice: 499,
          offerType: "unlock_offer",
        }),
      ]),
    );

    expect(result.discounts).toEqual([]);
  });

  test("does not count the offer item itself toward the threshold", () => {
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: 2000,
          unitPrice: 2000,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: 499,
          unitPrice: 499,
          offerType: "unlock_offer",
          offerCollectionId: ELIGIBLE_COLLECTION_ID,
        }),
      ]),
    );

    expect(result.discounts).toEqual([]);
  });

  test("skips the discount when the marked line does not belong to the configured collection", () => {
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: DEFAULT_THRESHOLD + 500,
          unitPrice: DEFAULT_THRESHOLD + 500,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: 499,
          unitPrice: 499,
          offerType: "unlock_offer",
          offerCollectionId: "gid://shopify/Collection/999",
        }),
      ]),
    );

    expect(result.discounts).toEqual([]);
  });

  test("skips the discount when the marked offer item costs more than Rs 600", () => {
    const result = run(
      createInput([
        createCartLine({
          id: "qualifying-line",
          subtotal: DEFAULT_THRESHOLD + 500,
          unitPrice: DEFAULT_THRESHOLD + 500,
        }),
        createCartLine({
          id: "offer-line",
          subtotal: MAX_OFFER_UNIT_PRICE + 1,
          unitPrice: MAX_OFFER_UNIT_PRICE + 1,
          offerType: "unlock_offer",
          offerCollectionId: ELIGIBLE_COLLECTION_ID,
        }),
      ]),
    );

    expect(result.discounts).toEqual([]);
  });

  test("skips the discount entirely when the deal is disabled", () => {
    const result = run(
      createInput(
        [
          createCartLine({
            id: "qualifying-line",
            subtotal: DEFAULT_THRESHOLD + 500,
            unitPrice: DEFAULT_THRESHOLD + 500,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 499,
            unitPrice: 499,
            offerType: "unlock_offer",
            offerCollectionId: ELIGIBLE_COLLECTION_ID,
          }),
        ],
        { enabled: false },
      ),
    );

    expect(result.discounts).toEqual([]);
  });
});
