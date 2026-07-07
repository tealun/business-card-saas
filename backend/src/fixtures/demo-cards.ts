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
    address: "广西桂林市高铁经济产业园长丰路27号"
  },
  status: "active",
  privacy: {
    show_mobile: false,
    show_email: true,
    show_wechat: false
  }
};

export const demoPublicCard: PublicCardResponse = {
  public_id: "pub_demo0001",
  status: "active",
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
      address: "广西桂林市高铁经济产业园长丰路27号"
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
        type: "paragraph",
        text: "这是一份 M1 演示企业介绍。正式环境由企业后台维护，公开名片只展示已发布内容。"
      }
    ],
    website_url: "https://example.com",
    address: "广西桂林市高铁经济产业园长丰路27号"
  },
  videos: [
    {
      video_id: "vid_demo_company",
      title: "企业介绍视频",
      video_url: "https://example.com/company-video.mp4",
      cover_url: null
    }
  ],
  honors: [
    {
      honor_id: "honor_demo_001",
      title: "公司荣誉",
      body: "荣誉内容示例，M2 接入企业内容管理后由后台维护。",
      images: [
        {
          image_url: "https://example.com/honor.jpg",
          title: "荣誉证书",
          caption: "示例图片"
        }
      ]
    }
  ]
};
