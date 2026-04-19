import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const SETTINGS_METAFIELD_KEY = "rupee_one_deal_settings";
const SETTINGS_METAFIELD_NAMESPACE = "$app";
const FUNCTION_CONFIG_KEY = "function-configuration";
const FUNCTION_CONFIG_NAMESPACE = "$app:rupee-one-deal";
const DEFAULT_THRESHOLD = 2999;
const MAX_OFFER_PRICE = 600;
const FUNCTION_HANDLE = "rupee-one-deal";
const DISCOUNT_TITLE = "Rufftail 1 Rs Deal";

const pageStyles = {
  display: "grid",
  gap: "1rem",
};

const gridStyles = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "2fr 1fr",
};

const cardStyles = {
  border: "1px solid var(--p-color-border-secondary, #d8d8d8)",
  borderRadius: "16px",
  padding: "1rem",
  background: "var(--p-color-bg-surface, #fff)",
};

const fieldStyles = {
  display: "grid",
  gap: "0.4rem",
};

const inputStyles = {
  width: "100%",
  padding: "0.75rem 0.875rem",
  borderRadius: "12px",
  border: "1px solid #c9cccf",
  fontSize: "0.95rem",
  background: "#fff",
};

const helpTextStyles = {
  margin: 0,
  color: "#5c5f62",
  fontSize: "0.9rem",
};

function defaultSettings() {
  return {
    enabled: true,
    threshold: DEFAULT_THRESHOLD,
    collectionId: "",
    collectionTitle: "",
    discountId: "",
    updatedAt: null,
  };
}

function parseSettings(value) {
  if (!value) {
    return defaultSettings();
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    return {
      enabled: parsed.enabled ?? true,
      threshold: Number(parsed.threshold ?? DEFAULT_THRESHOLD),
      collectionId: parsed.collectionId ?? "",
      collectionTitle: parsed.collectionTitle ?? "",
      discountId: parsed.discountId ?? "",
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return defaultSettings();
  }
}

function createFunctionConfiguration(settings) {
  return {
    enabled: settings.enabled,
    threshold: settings.threshold,
    collectionId: settings.collectionId,
    maxOfferPrice: MAX_OFFER_PRICE,
  };
}

async function queryJson(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  return response.json();
}

function getFirstUserError(payload) {
  return payload?.userErrors?.[0]?.message ?? null;
}

async function loadDashboardData(admin) {
  const data = await queryJson(
    admin,
    `#graphql
      query RupeeOneDealDashboard($namespace: String!, $key: String!) {
        shop {
          name
        }
        currentAppInstallation {
          id
          metafield(namespace: $namespace, key: $key) {
            jsonValue
          }
        }
        collections(first: 100, sortKey: TITLE) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `,
    {
      namespace: SETTINGS_METAFIELD_NAMESPACE,
      key: SETTINGS_METAFIELD_KEY,
    },
  );

  const settings = parseSettings(
    data.data?.currentAppInstallation?.metafield?.jsonValue ?? null,
  );

  return {
    appInstallationId: data.data?.currentAppInstallation?.id,
    collections: data.data?.collections?.nodes ?? [],
    settings,
    shopName: data.data?.shop?.name ?? "your store",
  };
}

async function createAutomaticDiscount(admin) {
  const result = await queryJson(
    admin,
    `#graphql
      mutation CreateRupeeDealDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      automaticAppDiscount: {
        title: DISCOUNT_TITLE,
        functionHandle: FUNCTION_HANDLE,
        startsAt: new Date().toISOString(),
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        },
      },
    },
  );

  const payload = result.data?.discountAutomaticAppCreate;
  const error = getFirstUserError(payload);

  return {
    discountId: payload?.automaticAppDiscount?.discountId ?? "",
    error,
  };
}

async function updateAutomaticDiscount(admin, discountId) {
  const result = await queryJson(
    admin,
    `#graphql
      mutation UpdateRupeeDealDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: discountId,
      automaticAppDiscount: {
        title: DISCOUNT_TITLE,
        startsAt: new Date().toISOString(),
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        },
      },
    },
  );

  const payload = result.data?.discountAutomaticAppUpdate;
  const error = getFirstUserError(payload);

  return {
    discountId: payload?.automaticAppDiscount?.discountId ?? "",
    error,
  };
}

async function ensureAutomaticDiscount(admin, currentDiscountId) {
  if (currentDiscountId) {
    const updated = await updateAutomaticDiscount(admin, currentDiscountId);
    if (!updated.error && updated.discountId) {
      return updated;
    }
  }

  return createAutomaticDiscount(admin);
}

async function saveDiscountConfiguration(admin, discountId, configuration) {
  const result = await queryJson(
    admin,
    `#graphql
      mutation SaveRupeeDealFunctionConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: discountId,
          namespace: FUNCTION_CONFIG_NAMESPACE,
          key: FUNCTION_CONFIG_KEY,
          type: "json",
          value: JSON.stringify(configuration),
        },
      ],
    },
  );

  return getFirstUserError(result.data?.metafieldsSet);
}

async function saveDashboardSettings(admin, appInstallationId, settings) {
  const result = await queryJson(
    admin,
    `#graphql
      mutation SaveRupeeOneDealSettings($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: appInstallationId,
          namespace: SETTINGS_METAFIELD_NAMESPACE,
          key: SETTINGS_METAFIELD_KEY,
          type: "json",
          value: JSON.stringify(settings),
        },
      ],
    },
  );

  return getFirstUserError(result.data?.metafieldsSet);
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return loadDashboardData(admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const dashboardData = await loadDashboardData(admin);

  const thresholdValue = Number(formData.get("threshold") || DEFAULT_THRESHOLD);
  const enabled = formData.get("enabled") === "on";
  const collectionId = String(formData.get("collectionId") || "");
  const selectedCollection =
    dashboardData.collections.find((collection) => collection.id === collectionId) ?? null;

  if (!Number.isFinite(thresholdValue) || thresholdValue < 1) {
    return {
      ok: false,
      error: "Minimum cart subtotal must be at least Rs 1.",
    };
  }

  if (enabled && !selectedCollection) {
    return {
      ok: false,
      error: "Select the collection page that should unlock the 1 Rs deal.",
    };
  }

  if (!dashboardData.appInstallationId) {
    return {
      ok: false,
      error: "Unable to find the current app installation for saving settings.",
    };
  }

  const ensuredDiscount = await ensureAutomaticDiscount(
    admin,
    dashboardData.settings.discountId,
  );

  if (!ensuredDiscount.discountId) {
    return {
      ok: false,
      error:
        ensuredDiscount.error ??
        "Unable to activate the Shopify automatic discount for the 1 Rs deal.",
    };
  }

  const nextSettings = {
    enabled,
    threshold: Math.round(thresholdValue),
    collectionId: selectedCollection?.id ?? "",
    collectionTitle: selectedCollection?.title ?? "",
    discountId: ensuredDiscount.discountId,
    updatedAt: new Date().toISOString(),
  };

  const functionConfigError = await saveDiscountConfiguration(
    admin,
    ensuredDiscount.discountId,
    createFunctionConfiguration(nextSettings),
  );

  if (functionConfigError) {
    return {
      ok: false,
      error: functionConfigError,
    };
  }

  const settingsSaveError = await saveDashboardSettings(
    admin,
    dashboardData.appInstallationId,
    nextSettings,
  );

  if (settingsSaveError) {
    return {
      ok: false,
      error: settingsSaveError,
    };
  }

  return {
    ok: true,
    message: "1 Rs deal settings saved and Shopify discount activated.",
    settings: nextSettings,
  };
};

export default function Index() {
  const { collections, settings, shopName } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const currentSettings = fetcher.data?.settings ?? settings;
  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const cartSnippet = `{
  merchandiseId: "gid://shopify/ProductVariant/REPLACE_ME",
  quantity: 1,
  attributes: [
    { key: "_offer_type", value: "unlock_offer" },
    { key: "_offer_collection_id", value: "${currentSettings.collectionId || "gid://shopify/Collection/REPLACE_ME"}" }
  ]
}`;

  return (
    <s-page heading="Rufftail 1 Rs Deal">
      <div style={pageStyles}>
        <s-banner tone="success">
          <p style={{ margin: 0 }}>
            Theme selection karwati hai, app actual Rs 1 billing karwati hai for{" "}
            {shopName}.
          </p>
        </s-banner>

        <div style={gridStyles}>
          <div style={cardStyles}>
            <s-heading>Deal settings</s-heading>
            <p style={helpTextStyles}>
              Theme offer UI handle karti hai. App automatic Shopify discount ko
              activate karke sirf selected collection-page item ki real billed
              price Rs 1 tak le jaati hai.
            </p>

            <fetcher.Form method="post" style={{ display: "grid", gap: "1rem" }}>
              <label style={{ ...fieldStyles, marginTop: "0.5rem" }}>
                <span>Enable 1 Rs deal</span>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={currentSettings.enabled}
                />
              </label>

              <label style={fieldStyles}>
                <span>Minimum cart subtotal (Rs)</span>
                <input
                  name="threshold"
                  type="number"
                  min="1"
                  defaultValue={currentSettings.threshold}
                  style={inputStyles}
                />
                <p style={helpTextStyles}>
                  Offer item ko hata kar baaki cart total is amount tak pahunchna
                  chahiye.
                </p>
              </label>

              <label style={fieldStyles}>
                <span>Eligible collection page</span>
                <select
                  name="collectionId"
                  defaultValue={currentSettings.collectionId}
                  style={inputStyles}
                >
                  <option value="">Select a collection</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title} ({collection.handle})
                    </option>
                  ))}
                </select>
                <p style={helpTextStyles}>
                  Sirf isi collection page se chosen item 1 Rs deal ke liye
                  eligible hoga. Theme ko same collection ID cart attribute me
                  bhejni hogi.
                </p>
              </label>

              {fetcher.data?.error ? (
                <s-banner tone="critical">
                  <p style={{ margin: 0 }}>{fetcher.data.error}</p>
                </s-banner>
              ) : null}

              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button type="submit" disabled={isSaving} style={inputStyles}>
                  {isSaving ? "Saving..." : "Save settings"}
                </button>
                {currentSettings.updatedAt ? (
                  <span style={helpTextStyles}>
                    Last updated: {new Date(currentSettings.updatedAt).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </fetcher.Form>
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={cardStyles}>
              <s-heading>Current rule</s-heading>
              <p style={helpTextStyles}>
                Status: {currentSettings.enabled ? "Enabled" : "Disabled"}
              </p>
              <p style={helpTextStyles}>
                Threshold: Rs {currentSettings.threshold}
              </p>
              <p style={helpTextStyles}>
                Collection: {currentSettings.collectionTitle || "Not selected"}
              </p>
              <p style={helpTextStyles}>
                Marked offer item price must be Rs {MAX_OFFER_PRICE} or below.
              </p>
            </div>

            <div style={cardStyles}>
              <s-heading>Theme to app handoff</s-heading>
              <p style={helpTextStyles}>
                Theme should add exactly one selected offer item to cart and mark it
                like this:
              </p>
              <pre
                style={{
                  margin: "0.75rem 0 0",
                  padding: "0.9rem",
                  borderRadius: "12px",
                  background: "#111827",
                  color: "#f9fafb",
                  overflowX: "auto",
                  fontSize: "0.85rem",
                }}
              >
                <code>{cartSnippet}</code>
              </pre>
            </div>

            <div style={cardStyles}>
              <s-heading>How billing works</s-heading>
              <p style={helpTextStyles}>
                If non-offer cart subtotal is Rs {currentSettings.threshold}+ and
                the marked item belongs to the selected collection page and costs
                Rs {MAX_OFFER_PRICE} or less, the Shopify Discount Function reduces
                that line so customer pays final Rs 1.
              </p>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
