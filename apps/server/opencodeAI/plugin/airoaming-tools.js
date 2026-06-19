import { tool } from "@opencode-ai/plugin"

// AIRoaming 工具插件:所有 AI 自主调用的业务工具集中注册在此。
// 放到 OpenCode 插件发现目录(~/.config/opencode/plugin/ 或项目 .opencode/plugins/),
// OpenCode 1.17.8 自动发现。
//
// execute 保持瘦:只做参数校验 + HTTP 回调后端 tool-callback 网关 + 结果格式化。
// 业务逻辑(调豆包、写文件、存 asset)全在后端 ProjectsService。

const SERVER_URL = process.env.AIROAMING_TOOL_CALLBACK_BASE_URL
const CALLBACK_TOKEN = process.env.AIROAMING_TOOL_CALLBACK_TOKEN || ""

/**
 * 统一回调后端 tool-callback 网关
 * @param {string} toolName 工具名(对应后端路由 /tool-callback/<toolName>)
 * @param {object} body 请求体
 * @returns {Promise<string>} 给 AI 的结果文本
 */
async function callback(toolName, body) {
  if (!SERVER_URL) {
    return "错误:AIROAMING_TOOL_CALLBACK_BASE_URL 未配置,无法回调后端。"
  }
  try {
    const response = await fetch(`${SERVER_URL}/tool-callback/${toolName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-airoaming-tool-token": CALLBACK_TOKEN,
      },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (parseError) {
      return `工具执行失败:后端响应非JSON(HTTP ${response.status})。前100字符: ${text.slice(0, 100)}`
    }
    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || `请求失败:${response.status}`
      return `工具执行失败:${errorMsg}`
    }
    // 后端返回 { success: true, data: {...} }
    const result = data?.data ?? data
    const createdCount = result?.createdCount ?? 0
    const tasks = result?.tasks ?? []
    if (createdCount > 0) {
      return `已开始生成,任务已在队列中(taskId: ${tasks[0]?.id ?? "未知"})。生成完成后会异步落盘。`
    }
    return "任务已在队列中(已有进行中的同类任务)。"
  } catch (error) {
    return `工具执行异常:${error instanceof Error ? error.message : String(error)}`
  }
}

export default async () => {
  return {
    tool: {
      // 生成角色预览图(单人造像,确定长相气质)
      generate_character_image: tool({
        description:
          "【生成角色预览图】为项目角色生成一张正面半身预览图,用于确定角色的长相和气质。需要角色名和项目ID。生成是异步的,调用后会进入任务队列。当用户说'给某角色生成图''生成角色预览'时使用。",
        args: {
          projectId: tool.schema.string().describe("当前项目ID"),
          characterName: tool.schema.string().describe("要生成图的角色名(必须是项目角色库里已有的角色)"),
          prompt: tool.schema
            .string()
            .optional()
            .describe("可选,生图提示词。不传则用角色档案的默认描述"),
        },
        async execute(args) {
          return callback("generate_character_image", {
            projectId: args.projectId,
            characterName: args.characterName,
            prompt: args.prompt,
          })
        },
      }),

      // 生成角色三向图(定稿图:正面/侧面/背面组合)
      generate_character_final: tool({
        description:
          "【生成角色三向图(定稿)】为已生成预览图的角色生成定稿三向图,包含正面半身、正面全身、侧面全身、背面全身的组合设定图。需要角色名和项目ID。三向图的提示词与预览图不同,这是独立的技能。当用户说'生成定稿''生成三向图''定稿角色'时使用。",
        args: {
          projectId: tool.schema.string().describe("当前项目ID"),
          characterName: tool.schema.string().describe("要生成三向图的角色名(必须已生成过预览图)"),
          prompt: tool.schema
            .string()
            .optional()
            .describe("可选,三向图生图提示词。不传则用角色档案的默认描述"),
        },
        async execute(args) {
          return callback("generate_character_final", {
            projectId: args.projectId,
            characterName: args.characterName,
            prompt: args.prompt,
          })
        },
      }),

      // 生成场景背景图
      generate_scene_image: tool({
        description:
          "【生成场景背景图】为当前章节的某个场景生成一张背景图(横向16:9)。需要项目ID、章节ID和场景ID。生成是异步的,调用后进入任务队列。当用户说'给场景生成图''生成场景背景'时使用。",
        args: {
          projectId: tool.schema.string().describe("当前项目ID"),
          chapterId: tool.schema.string().describe("当前章节ID(如 chapter_001)"),
          sceneId: tool.schema.string().describe("要生成图的场景ID(如 scene_01,从剧情结构场景卡获取)"),
          prompt: tool.schema
            .string()
            .optional()
            .describe("可选,生图提示词。不传则用场景的名称/地点/氛围自动拼接"),
        },
        async execute(args) {
          return callback("generate_scene_image", {
            projectId: args.projectId,
            chapterId: args.chapterId,
            sceneId: args.sceneId,
            prompt: args.prompt,
          })
        },
      }),

      // 提取项目角色(从剧本大纲/剧情结构提取角色进项目角色库)
      extract_characters: tool({
        description:
          "【提取项目角色】从项目剧本大纲或剧情结构中提取角色,自动创建项目角色库条目。新角色会建档(有名字无图,图需单独生成)。当用户说'提取角色''整理角色库''把角色加入角色库'时使用。",
        args: {
          projectId: tool.schema.string().describe("当前项目ID"),
        },
        async execute(args) {
          return callback("extract_characters", {
            projectId: args.projectId,
          })
        },
      }),
    },
  }
}
