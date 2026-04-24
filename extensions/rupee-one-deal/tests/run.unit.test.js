import { describe, expect, test } from "vitest";
import {
  DEAL_MESSAGE,
  DEFAULT_THRESHOLD,
  MAX_OFFER_UNIT_PRICE,
  ONE_RUPEE_FINAL_PRICE,
  ORDER_SELECTION_STRATEGY,
  PRODUCT_SELECTION_STRATEGY,
  SAVE5_CODE,
  SAVE5_THRESHOLD,
  SAVE8_CODE,
  SAVE8_THRESHOLD,
  run,
} from "../src/run.js";

const ELIGIBLE_COLLECTION_ID = "gid://shopify/Collection/111";

function createInput(lines, options = {}) {
  const {
    config = {},
    discountClasses = ["PRODUCT"],
    triggeringDiscountCode = null,
  } = options;

  return {
    discount: {
      discountClasses,
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
    triggeringDiscountCode,
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

    expect(result.operations).toEqual([]);
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

    expect(result.operations).toEqual([
      {
        productDiscountsAdd: {
          selectionStrategy: PRODUCT_SELECTION_STRATEGY,
          candidates: [
            {
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
            },
          ],
        },
      },
    ]);
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

    expect(result.operations).toEqual([]);
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

    expect(result.operations).toEqual([]);
  });

  test("applies SAVE5 order discount at Rs 6999 and excludes the offer line from percentage discounting", () => {
    const result = run(
      createInput(
        [
          createCartLine({
            id: "qualifying-line",
            subtotal: SAVE5_THRESHOLD,
            unitPrice: SAVE5_THRESHOLD,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 499,
            unitPrice: 499,
            offerType: "unlock_offer",
            offerCollectionId: ELIGIBLE_COLLECTION_ID,
          }),
        ],
        {
          discountClasses: ["PRODUCT", "ORDER"],
          triggeringDiscountCode: SAVE5_CODE,
        },
      ),
    );

    expect(result.operations).toHaveLength(2);
    expect(result.operations[1]).toEqual({
      orderDiscountsAdd: {
        selectionStrategy: ORDER_SELECTION_STRATEGY,
        candidates: [
          {
            message: "SAVE5 5% Off",
            targets: [
              {
                orderSubtotal: {
                  excludedCartLineIds: ["offer-line"],
                },
              },
            ],
            value: {
              percentage: {
                value: 5,
              },
            },
          },
        ],
      },
    });
  });

  test("applies SAVE8 order discount at Rs 9999 even without an offer line", () => {
    const result = run(
      createInput(
        [
          createCartLine({
            id: "qualifying-line",
            subtotal: SAVE8_THRESHOLD,
            unitPrice: SAVE8_THRESHOLD,
          }),
        ],
        {
          discountClasses: ["ORDER"],
          triggeringDiscountCode: SAVE8_CODE,
        },
      ),
    );

    expect(result.operations).toEqual([
      {
        orderDiscountsAdd: {
          selectionStrategy: ORDER_SELECTION_STRATEGY,
          candidates: [
            {
              message: "SAVE8 8% Off",
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [],
                  },
                },
              ],
              value: {
                percentage: {
                  value: 8,
                },
              },
            },
          ],
        },
      },
    ]);
  });

  test("skips order slab discount when coupon threshold is not met", () => {
    const result = run(
      createInput(
        [
          createCartLine({
            id: "qualifying-line",
            subtotal: SAVE5_THRESHOLD - 1,
            unitPrice: SAVE5_THRESHOLD - 1,
          }),
        ],
        {
          discountClasses: ["ORDER"],
          triggeringDiscountCode: SAVE5_CODE,
        },
      ),
    );

    expect(result.operations).toEqual([]);
  });

  test("skips the discount entirely when the deal is disabled", () => {
    const result = run(
      createInput(
        [
          createCartLine({
            id: "qualifying-line",
            subtotal: SAVE8_THRESHOLD,
            unitPrice: SAVE8_THRESHOLD,
          }),
          createCartLine({
            id: "offer-line",
            subtotal: 499,
            unitPrice: 499,
            offerType: "unlock_offer",
            offerCollectionId: ELIGIBLE_COLLECTION_ID,
          }),
        ],
        {
          config: { enabled: false },
          discountClasses: ["PRODUCT", "ORDER"],
          triggeringDiscountCode: SAVE8_CODE,
        },
      ),
    );

    expect(result.operations).toEqual([]);
  });
});
