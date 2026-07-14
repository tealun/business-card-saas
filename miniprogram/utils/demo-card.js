const DEMO_CARD_ID = "demo_zhiyun_enterprise";
const DEMO_CARD_PUBLIC_ID = "pub_demo0001";
const DEMO_CARD_ROUTE = "/pages/public/card?demo=1";

const DEMO_CARD_IDENTITY = Object.freeze({
  member_identity_id: DEMO_CARD_ID,
  public_id: DEMO_CARD_PUBLIC_ID,
  identity_type: "demo_enterprise",
  display_name: "智云科技",
  optionName: "智云科技",
  tenant_name: "智云科技（深圳）有限公司",
  typeLabel: "企业名片",
  badgeClass: "badge--success",
  subtitle: "智云科技（深圳）有限公司",
  isDemo: true,
  sampleLabel: "样例"
});

function demoIdentity(selected = false) {
  return Object.assign({}, DEMO_CARD_IDENTITY, { selected: Boolean(selected) });
}

module.exports = {
  DEMO_CARD_ID,
  DEMO_CARD_PUBLIC_ID,
  DEMO_CARD_ROUTE,
  DEMO_CARD_IDENTITY,
  demoIdentity
};
