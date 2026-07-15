import type { EmployeeCardResponse } from "../contracts/employee-card.js";
import type { PublicCardResponse } from "../contracts/public-card.js";

/**
 * Demo fixtures used only when persistence is unavailable (e.g. local dev / tests).
 * These cards are intentionally labeled as demo data and never contain real
 * contact placeholders such as "021-5566XXXX".
 */

export const demoEmployeeCard: EmployeeCardResponse = {
  card_id: "card_demo_001",
  public_id: "pub_demo0001",
  display_name: "M1 Demo Employee",
  title: "Sales Consultant",
  company: "Demo Tenant",
  avatar_url: null,
  fields: {
    mobile: null,
    phone: null,
    email: "demo@example.com",
    wechat_id: null,
    address: "[示例地址]"
  },
  status: "active",
  privacy: {
    show_mobile: false,
    show_email: true,
    show_wechat: false,
    allow_forward: true,
    show_avatar: true,
    share_title: null
  }
};

export const demoPublicCard: PublicCardResponse = {
  public_id: "pub_demo0001",
  status: "active",
  allow_forward: true,
  show_avatar: true,
  share_title: null,
  card: {
    display_name: "M1 Demo Employee",
    title: "Sales Consultant",
    company: "Demo Tenant",
    avatar_url: null,
    fields: {
      mobile: null,
      phone: null,
      email: "demo@example.com",
      wechat_id: null,
      address: "[示例地址]"
    }
  },
  template: {
    template_id: "tpl_demo_business",
    logo_url: null,
    background_url: null,
    color_scheme: {
      primary: "#1677ff",
      surface: "#ffffff"
    },
    layout: {
      variant: "horizontal-business"
    }
  },
  company_profile: {
    name: "Demo Tenant",
    intro_blocks: [
      {
        type: "heading",
        text: "智云科技企业展示样例"
      },
      {
        type: "paragraph",
        text: "智云科技专注企业数字化名片与获客解决方案，为企业提供统一对外形象、员工名片管理、客户转化追踪与企业官网式展示能力。我们把原本分散在员工微信、纸质名片、官网页面和销售资料里的信息整合到一张可分享、可追踪、可持续运营的企业名片中。"
      },
      {
        type: "quote",
        text: "我们的目标不是把名片做得更花，而是让每一次客户打开名片时，都能更快理解企业是谁、能提供什么价值，以及下一步应该如何联系。"
      },
      {
        type: "list",
        items: ["统一企业品牌形象", "员工名片集中管理", "访客行为与转化追踪"]
      },
      {
        type: "image",
        url: "/api/v1/demo-assets/company/profile-office.png",
        caption: "开放协作办公区"
      },
      {
        type: "gallery",
        images: [
          {
            url: "/api/v1/demo-assets/company/profile-office.png",
            caption: "客户共创会议"
          },
          {
            url: "/api/v1/demo-assets/company/service-brand.png",
            caption: "企业服务团队"
          },
          {
            url: "/api/v1/demo-assets/company/service-identity.png",
            caption: "产品研发现场"
          }
        ]
      },
      {
        type: "paragraph",
        text: "在销售、招聘、渠道合作和客户服务场景中，企业名片会作为轻量入口承接外部流量。管理员可以按模块维护产品服务、企业简介、荣誉资质和视频内容；员工转发自己的名片时，访客看到的不只是个人联系方式，也能顺手了解企业能力、查看案例素材、保存联系方式或继续转发给决策人。"
      },
      {
        type: "video",
        video_id: "123"
      }
    ],
    service_items: [
      {
        id: "service_identity",
        title: "企业数字名片",
        description: "统一员工名片、企业资料与品牌视觉。",
        image_url: "/api/v1/demo-assets/company/service-identity.png",
        visible: true,
        sort_order: 10
      },
      {
        id: "service_leads",
        title: "客户留资与跟进",
        description: "记录访问、点赞、转发等关键行为。",
        image_url: "/api/v1/demo-assets/company/service-leads.png",
        visible: true,
        sort_order: 20
      },
      {
        id: "service_brand",
        title: "企业官网式展示",
        description: "模块化呈现产品、简介、视频和荣誉。",
        image_url: "/api/v1/demo-assets/company/service-brand.png",
        visible: true,
        sort_order: 30
      },
      {
        id: "service_analytics",
        title: "访问数据分析",
        description: "帮助销售团队判断客户兴趣与跟进优先级。",
        image_url: "/api/v1/demo-assets/company/service-leads.png",
        visible: true,
        sort_order: 40
      },
      {
        id: "service_wecom",
        title: "企微身份集成",
        description: "对接企业微信身份与组织架构。",
        image_url: "/api/v1/demo-assets/company/service-identity.png",
        visible: true,
        sort_order: 50
      }
    ],
    display_modules: [
      { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
      { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
      { key: "videos", title: "企业视频", visible: true, sort_order: 30, layout: "carousel" },
      { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "carousel" }
    ],
    website_url: "https://example.com",
    address: "[示例地址]"
  },
  videos: [
    {
      video_id: "123",
      title: "企业介绍视频",
      video_url: "/api/v1/demo-assets/company/company-intro.mp4",
      cover_url: "/api/v1/demo-assets/company/video-cover.png"
    }
  ],
  honors: [
    {
      honor_id: "honor_demo_001",
      title: "年度数字化服务创新奖",
      body: "展示荣誉资质模块的多图轮播与大图预览能力。",
      images: [
        {
          image_url: "/api/v1/demo-assets/company/honor-award.png",
          title: "创新奖证书",
          caption: "行业协会颁发"
        },
        {
          image_url: "/api/v1/demo-assets/company/service-brand.png",
          title: "颁奖现场",
          caption: "年度服务创新论坛"
        }
      ]
    },
    {
      honor_id: "honor_demo_002",
      title: "ISO 质量管理体系认证",
      body: "展示同一荣誉下多张图片、图片标题与说明。",
      images: [
        {
          image_url: "/api/v1/demo-assets/company/honor-award.png",
          title: "认证证书",
          caption: "质量管理体系认证"
        },
        {
          image_url: "/api/v1/demo-assets/company/profile-office.png",
          title: "审核会议",
          caption: "标准流程复核"
        }
      ]
    }
  ],
  stats: {
    visitor_count: 0,
    visit_count: 0,
    like_count: 0,
    liked_by_current_visitor: false
  }
};
