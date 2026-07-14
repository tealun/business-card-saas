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
        text: "这是一份完整的模块化企业名片样例，用于展示产品服务、企业简介、多图相册、视频与荣誉资质。正式环境由企业后台维护，公开名片只展示已发布内容。"
      },
      {
        type: "list",
        items: ["统一企业品牌形象", "员工名片集中管理", "访客行为与转化追踪"]
      },
      {
        type: "image",
        url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
        caption: "开放协作办公区"
      },
      {
        type: "gallery",
        images: [
          {
            url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2",
            caption: "客户共创会议"
          },
          {
            url: "https://images.unsplash.com/photo-1556761175-4b46a572b786",
            caption: "企业服务团队"
          },
          {
            url: "https://images.unsplash.com/photo-1551434678-e076c223a692",
            caption: "产品研发现场"
          }
        ]
      },
      {
        type: "video",
        video_id: "vid_demo_company"
      }
    ],
    service_items: [
      {
        id: "service_identity",
        title: "企业数字名片",
        description: "统一员工名片、企业资料与品牌视觉。",
        image_url: "https://images.unsplash.com/photo-1556761175-b413da4baf72",
        visible: true,
        sort_order: 10
      },
      {
        id: "service_leads",
        title: "客户留资与跟进",
        description: "记录访问、点赞、转发等关键行为。",
        image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978",
        visible: true,
        sort_order: 20
      },
      {
        id: "service_brand",
        title: "企业官网式展示",
        description: "模块化呈现产品、简介、视频和荣誉。",
        image_url: "https://images.unsplash.com/photo-1497366216548-37526070297c",
        visible: true,
        sort_order: 30
      },
      {
        id: "service_analytics",
        title: "访问数据分析",
        description: "帮助销售团队判断客户兴趣与跟进优先级。",
        image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71",
        visible: true,
        sort_order: 40
      },
      {
        id: "service_wecom",
        title: "企微身份集成",
        description: "对接企业微信身份与组织架构。",
        image_url: "https://images.unsplash.com/photo-1559136555-9303baea8ebd",
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
      video_id: "vid_demo_company",
      title: "企业介绍视频",
      video_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      cover_url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72"
    }
  ],
  honors: [
    {
      honor_id: "honor_demo_001",
      title: "年度数字化服务创新奖",
      body: "展示荣誉资质模块的多图轮播与大图预览能力。",
      images: [
        {
          image_url: "https://images.unsplash.com/photo-1567427017947-545c5f8d16ad",
          title: "创新奖证书",
          caption: "行业协会颁发"
        },
        {
          image_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216",
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
          image_url: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85",
          title: "认证证书",
          caption: "质量管理体系认证"
        },
        {
          image_url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d",
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
