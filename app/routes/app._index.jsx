import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const SETTINGS_METAFIELD_KEY = "rupee_one_deal_settings";
const SETTINGS_METAFIELD_NAMESPACE = "$app";
const DEFAULT_THRESHOLD = 2999;

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

function parseSettings(value) {
  if (!value) {
    return {
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      updatedAt: null,
    };
  }

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    return {
      enabled: parsed.enabled ?? true,
      threshold: Number(parsed.threshold ?? DEFAULT_THRESHOLD),
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return {
      enabled: true,
      threshold: DEFAULT_THRESHOLD,
      updatedAt: null,
    };
  }
}

async function queryJson(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  return response.json();
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
    settings,
    shopName: data.data?.shop?.name ?? "your store",
  };
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return loadDashboardData(admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const thresholdValue = Number(formData.get("threshold") || DEFAULT_THRESHOLD);
  const enabled = formData.get("enabled") === "on";

  if (!Number.isFinite(thresholdValue) || thresholdValue < 1) {
    return {
      ok: false,
      error: "Minimum cart subtotal must be at least Rs 1.",
    };
  }

  const dashboardData = await loadDashboardData(admin);
  const appInstallationId = dashboardData.appInstallationId;

  if (!appInstallationId) {
    return {
      ok: false,
      error: "Unable to find the current app installation for saving settings.",
    };
  }

  const nextSettings = {
    enabled,
    threshold: Math.round(thresholdValue),
    updatedAt: new Date().toISOString(),
  };

  const saveResult = await queryJson(
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
          value: JSON.stringify(nextSettings),
        },
      ],
    },
  );

  const userErrors = saveResult.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors[0].message,
    };
  }

  return {
    ok: true,
    message: "1 Rs deal settings saved.",
    settings: nextSettings,
  };
};

export default function Index() {
  const { settings, shopName } = useLoaderData();
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
  attributes: [{ key: "_offer_type", value: "unlock_offer" }]
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
              Theme already handles the offer UI and marks the chosen line with
              <code> _offer_type=unlock_offer </code>. This app only controls
              whether the deal is enabled and what cart subtotal unlocks it.
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
                Theme is responsible for deciding which offer item the shopper
                picks.
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
                If non-offer cart subtotal is Rs {currentSettings.threshold}+,
                the Shopify Discount Function reduces that marked offer line so
                customer pays final Rs 1.
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
