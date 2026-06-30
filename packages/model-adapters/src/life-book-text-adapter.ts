import type {
  CompleteLifeChapter,
  CompleteLifeScript,
  LifeBookPage,
  LifeBookSeedResult,
  LifeDecisionOption,
  LifeDecisionQuestion,
  LifePersona,
  LifeSelectedDecision,
  LifeState,
} from "@short-drama/domain";
import { createId, nowIso } from "@short-drama/domain";

export interface LifeBookTextResult<T> {
  output: T;
  modelAlias: string;
  inputSummary: string;
}

interface AutonomousDecisionPlan {
  decisions: Array<{ questionId: string; optionId: string; reason: string }>;
}

interface LifeBookScriptOverview {
  title: string;
  logline: string;
  worldview: string;
  lifeArc: string;
  relationshipArc: string;
  chapters: Array<Pick<CompleteLifeChapter, "chapterIndex" | "title" | "ageRange" | "selectedChoiceLabel" | "summary" | "characterMoment" | "emotionalTurn" | "consequence" | "cliffhanger">>;
  ending: string;
  epitaph: string;
  scores: Array<{ label: string; value: number }>;
}

const DEFAULT_TEXT_BASE_URL = "https://aidp.bytedance.net/api/modelhub/online/v2/crawl/openai/deployments/gpt_openapi";
const DEFAULT_TEXT_API_VERSION = "2024-03-01-preview";
const DEFAULT_TEXT_MODEL = "ali-deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 1048576;
const NEGATIVE_PROMPT = "modern objects, anachronistic clothing, extra fingers, distorted face, text, watermark, logo, low quality";

function logTextStage(message: string): void {
  console.log(`[life-book-text] ${new Date().toISOString()} ${message}`);
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function config() {
  const apiKey = readEnv("LIFE_TEXT_API_KEY", "LIFE_MODEL_API_KEY", "MODELHUB_API_KEY", "TEXT_API_KEY");
  return {
    apiKey,
    baseUrl: readEnv("LIFE_TEXT_BASE_URL", "TEXT_BASE_URL") || DEFAULT_TEXT_BASE_URL,
    apiVersion: readEnv("LIFE_TEXT_API_VERSION", "TEXT_API_VERSION") || DEFAULT_TEXT_API_VERSION,
    model: readEnv("LIFE_TEXT_MODEL", "TEXT_MODEL") || DEFAULT_TEXT_MODEL,
    maxTokens: Number.parseInt(readEnv("LIFE_TEXT_MAX_TOKENS", "TEXT_MAX_TOKENS") || String(DEFAULT_MAX_TOKENS), 10),
    timeoutMs: Number.parseInt(readEnv("LIFE_TEXT_TIMEOUT_MS", "TEXT_TIMEOUT_MS", "MODEL_TIMEOUT_MS") || "240000", 10),
  };
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || "Text model request failed";
    try {
      const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = data.error?.message || data.message || message;
    } catch {}
    throw new Error(`Text model request failed with HTTP ${response.status} ${response.statusText}: ${message}`);
  }
  return JSON.parse(text) as unknown;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [`${error.name}: ${error.message}`];
  let cause = error.cause;
  while (cause) {
    if (cause instanceof Error) {
      const codeValue = (cause as { code?: unknown }).code;
      const code = typeof codeValue === "string" ? ` code=${codeValue}` : "";
      parts.push(`caused by ${cause.name}${code}: ${cause.message}`);
      cause = cause.cause;
    } else {
      parts.push(`caused by ${String(cause)}`);
      break;
    }
  }
  return parts.join("; ");
}

function extractText(payload: unknown): string {
  const data = payload as { choices?: Array<{ message?: { content?: string } }>; output_text?: string };
  return data.output_text || data.choices?.[0]?.message?.content || "";
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim();
}

async function callText<T>(task: string, prompt: string, inputSummary: string, repair = true): Promise<LifeBookTextResult<T>> {
  const c = config();
  if (!c.apiKey) throw new Error("LIFE_TEXT_API_KEY or LIFE_MODEL_API_KEY is required");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), c.timeoutMs);
  const started = Date.now();
  try {
    logTextStage(`start task="${task}" model=${c.model} timeoutMs=${c.timeoutMs}`);
    const response = await fetch(`${normalizeBaseUrl(c.baseUrl)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": c.apiKey, Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        temperature: 0.78,
        max_tokens: c.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是人生副本故事书游戏的总编剧。只输出合法 JSON。故事必须具体、宏大、有命运感，选项必须巧妙、有代价、符合时代身份约束。" },
          { role: "user", content: `${task}\n\n${prompt}` },
        ],
      }),
      signal: controller.signal,
    });
    const raw = extractText(await readJsonResponse(response));
    logTextStage(`response task="${task}" elapsedSec=${Math.round((Date.now() - started) / 1000)} chars=${raw.length}`);
    try {
      const parsed = JSON.parse(extractJson(raw)) as T;
      logTextStage(`parsed task="${task}" elapsedSec=${Math.round((Date.now() - started) / 1000)}`);
      return { output: parsed, modelAlias: c.model, inputSummary };
    } catch (error) {
      logTextStage(`parse_failed task="${task}" elapsedSec=${Math.round((Date.now() - started) / 1000)} error=${error instanceof Error ? error.message : String(error)}`);
      if (!repair) throw error;
      return callText<T>("修复 JSON", `请把下面坏 JSON 修复为合法 JSON，只输出 JSON：\n${raw.slice(0, 40000)}`, `${inputSummary}:repair`, false);
    }
  } catch (error) {
    logTextStage(`failed task="${task}" elapsedSec=${Math.round((Date.now() - started) / 1000)} error=${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Life book text model request timed out after ${c.timeoutMs}ms`);
    }
    if (error instanceof TypeError && error.message === "fetch failed") {
      throw new Error(`Life book text model fetch failed: ${describeError(error)}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSeedText(seedText?: string): { title: string; era: string; identity: string; coreTension: string } {
  const title = seedText?.trim() || "00年代北京Java程序员的一生：用技术、金钱或文字反写命运";
  const [subjectWithLife, tension] = title.split("：");
  const subject = subjectWithLife.replace(/的一生$/, "").trim();
  const eraMatch = subject.match(/^(.+?(?:年间|时期|时代|年代|末年|初年|中期|晚期|盛世|乱世|世纪(?:初|中叶|末)?|[0-9]{2,4}年代|[0-9]{2}年代))(.*)$/);
  const era = eraMatch?.[1]?.trim() || (subject.includes("大唐") ? "大唐天宝年间" : "近现代中国社会转型期");
  const identity = eraMatch?.[2]?.trim() || subject.replace(era, "").trim() || "普通人";
  return {
    title,
    era,
    identity,
    coreTension: tension?.trim() || "在时代秩序和个人自由之间挣扎",
  };
}

function fallbackLocation(seed: ReturnType<typeof parseSeedText>): string {
  if (/大唐|唐朝|天宝|陇右|边军|斥候/.test(`${seed.era}${seed.identity}`)) return "陇右边塞与长安朝堂";
  return seed.era;
}

function fallbackSocialClass(seed: ReturnType<typeof parseSeedText>): string {
  if (/大唐|唐朝|天宝|边军|斥候|府兵/.test(`${seed.era}${seed.identity}`)) return "边军寒门 / 府兵遗孤";
  return "普通城市劳动者 / 新兴职业阶层";
}

function fallbackBirthYear(seed: ReturnType<typeof parseSeedText>): string | undefined {
  if (/大唐|唐朝|天宝/.test(seed.era)) return "开元末年";
  return "1980年前后";
}

function fallbackPersona(seedText?: string): LifePersona {
  const seed = parseSeedText(seedText);
  return {
    title: seed.title,
    era: seed.era,
    location: fallbackLocation(seed),
    identity: seed.identity,
    socialClass: fallbackSocialClass(seed),
    gender: "unknown",
    birthYear: fallbackBirthYear(seed),
    coreTension: seed.coreTension,
    constraints: ["职业上升通道不稳定", "家庭期待与个人选择长期冲突", "时代机会和结构性风险并存", "亲密关系会被事业选择反复改写"],
    visualStyle: "真人电影剧照风格，现实主义传记片质感，时代环境准确，生活细节具体，宏大人生史诗",
    visualAnchor: `同一位${seed.identity}，从少年、青年、中年到晚年保持一致脸型和气质，服装、发型、道具随${seed.era}和人生阶段自然变化`,
  };
}

function option(label: string, description: string, shortTermTradeoff: string, longTermRisk: string, worldviewFit: string, hiddenForeshadowing: string): LifeDecisionOption {
  return { choiceId: createId("book_choice"), label, description, shortTermTradeoff, longTermRisk, worldviewFit, hiddenForeshadowing };
}

function fallbackSeed(seedText?: string): LifeBookSeedResult {
  const persona = fallbackPersona(seedText);
  const seed = parseSeedText(seedText);
  const initialState: LifeState = {
    age: 15,
    location: seed.era,
    health: 82,
    wealth: 42,
    reputation: 35,
    freedom: 48,
    risk: 46,
    relationships: [
      { name: "父亲", role: "家庭秩序的维护者", attitude: "希望你走一条安全、体面的路" },
      { name: "母亲", role: "日常生活的支撑者", attitude: "保护你，也担心你被时代吞没" },
      { name: "同伴", role: `同代${seed.identity}`, attitude: "既互相鼓励，也在竞争中渐行渐远" },
    ],
    flags: [seed.identity, seed.era, seed.coreTension],
  };
  const questionnaire: LifeDecisionQuestion[] = [
    {
      questionId: createId("question"), lifeAge: "15岁", stageTitle: "少年时第一次看见时代入口", setup: `你在${seed.era}长大，第一次意识到${seed.identity}这条路既可能改变命运，也可能吞掉生活。`, stakes: "你必须决定少年时期如何理解成功、家庭和自由。",
      options: [
        option("把安全放在第一位", "你选择先满足家人的期待，走一条稳妥路线。", "获得家庭支持。", "可能在多年后发现自己一直替别人生活。", "安全是普通家庭最朴素的策略。", "一次被放弃的兴趣会在中年重新回来。"),
        option("提前押注自己的热爱", "你把大量时间投入真正吸引你的方向。", "能力增长很快。", "成绩、关系或经济压力会提前爆发。", "热爱能打开通道，也会制造孤立。", "一个同伴会记住你此时的固执。"),
        option("学会隐藏真实野心", "你表面顺从，私下积累技能和信息。", "冲突暂时减少。", "长期习惯伪装会损害亲密关系。", "夹缝中的人常用双重生活自保。", "你会在多年后为一次沉默付出代价。"),
      ]
    },
    {
      questionId: createId("question"), lifeAge: "24岁", stageTitle: "进入职业世界的第一场豪赌", setup: `你正式成为${seed.identity}，时代正在给少数人突然上升的机会，也给更多人留下失败的账单。`, stakes: "第一份关键选择会决定你未来十年的路径。",
      options: [
        option("加入高速增长的团队", "你进入一个混乱但机会巨大的地方。", "成长速度极快。", "健康、关系和价值观会被透支。", "风口中的上升往往伴随失控。", "一个深夜项目会改变你和某个人的关系。"),
        option("选择稳定体面的单位", "你选择可预期的收入和社会评价。", "生活秩序更稳。", "可能错过时代红利。", "稳定是对风险时代的反击。", "你会在后来遇见当年没有选择的另一条路。"),
        option("和朋友一起冒险", "你把信任押在同伴和一个还没被证明的机会之上。", "拥有更大自主权。", "友情、金钱和责任会缠在一起。", "共同创业或冒险会放大人性裂缝。", "账本上的第一笔亏损会成为伏笔。"),
      ]
    },
    {
      questionId: createId("question"), lifeAge: "33岁", stageTitle: "上升期的关系代价", setup: "事业开始改变你的时间、脾气和亲密关系，家人和爱人都在用不同方式要求你停下来看看他们。", stakes: "你必须决定谁能进入你真正的人生核心。",
      options: [
        option("继续向上冲刺", "你把关键几年全部交给事业。", "地位和收入明显提高。", "亲密关系可能被长期忽视。", "上升期常把人训练成只看目标。", "一场缺席会成为无法修补的裂缝。"),
        option("为家庭放慢速度", "你主动拒绝一部分机会，保留生活。", "关系获得喘息。", "职业窗口可能关闭。", "自由也包括拒绝被时代推着跑。", "一个后辈会接走你放弃的位置。"),
        option("试图两边都要", "你用更高强度维持事业和关系。", "短期看似平衡。", "身体和情绪会先崩溃。", "很多人败在不肯承认资源有限。", "一次体检或争吵会提前预告危机。"),
      ]
    },
    {
      questionId: createId("question"), lifeAge: "45岁", stageTitle: "中年危机与价值重估", setup: "时代规则改变，年轻人、资本、制度或技术正在重写你曾经相信的一切。", stakes: "你要决定自己是守住旧身份，还是重新学习失败。",
      options: [
        option("抓住最后一轮机会", "你再次投入高风险转型。", "可能重回牌桌。", "失败会带走多年积累。", "中年冒险更昂贵，也更诚实。", "一个旧同伴会在此时重新出现。"),
        option("退回可控生活", "你减少野心，优先保住家人和身体。", "风险下降。", "内心会长期怀疑自己是否逃跑。", "幸存也是一种选择。", "晚年你会重新解释这次退让。"),
        option("把经验交给下一代", "你开始培养年轻人或孩子，让他们走你没走成的路。", "获得新的意义。", "控制欲可能伤害他们。", "传承常常混杂爱和补偿。", "下一代会在关键时刻反抗你。"),
      ]
    },
    {
      questionId: createId("question"), lifeAge: "62岁", stageTitle: "晚年回望与最后选择", setup: `你回看作为${seed.identity}的一生，终于看清${seed.coreTension}如何塑造了你和身边的人。`, stakes: "最后的选择不再改变事业，而是改变别人如何记住你。",
      options: [
        option("公开讲出真实经历", "你把荣耀、错误和亏欠都写下来。", "获得迟来的坦诚。", "会伤害仍想维持体面的人。", "讲述是晚年夺回人生解释权的方式。", "一个年轻人会因此改变选择。"),
        option("修复最重要的关系", "你放下胜负，去面对被你亏欠的人。", "关系可能获得和解。", "也可能只得到沉默。", "晚年的勇气常是承认自己错过了什么。", "一件旧物会成为结尾。"),
        option("把资源留给未来", "你设法把经验、钱或机会交给后来者。", "留下具体遗产。", "亲近的人可能觉得被再次忽视。", "遗产不是拥有过什么，而是留下些什么。", "你的名字会以意外方式被记住。"),
      ]
    },
  ];
  return { persona, initialState, questionnaire };
}

export class LifeBookTextAdapter {
  async generateSeed(seedText?: string): Promise<LifeBookTextResult<LifeBookSeedResult>> {
    const fallback = fallbackSeed(seedText);
    logTextStage(`generateSeed start seed="${(seedText || fallback.persona.title).slice(0, 80)}"`);
    try {
      const result = await callText<Partial<LifeBookSeedResult>>(
        "生成完整人生副本问卷",
        [
          "生成一个人生副本和完整决策问卷。输出 JSON：{persona, initialState, questionnaire}。",
          "questionnaire 需要 6-10 个重大人生节点，每题 3-5 个选项。",
          "lifeAge 必须严格递增，覆盖少年、青年、成年、中年、晚年；不得倒退、重复或与选项内容不匹配。",
          "stageTitle/setup/stakes 必须和该题 options 指向同一个人生阶段，禁止题头是少年但选项是晚年继承/生育/裁员。",
          "每个选项字段：choiceId可省略,label,description,shortTermTradeoff,longTermRisk,worldviewFit,hiddenForeshadowing。",
          "每题必须具体、有戏剧张力、符合时代身份，不得泛泛。",
          `用户想体验：${seedText || "随机宏大人生"}`,
          seedText ? "必须严格围绕用户想体验的人生副本生成，不得改成其他国家、时代、身份或职业；不得出现韩国财阀、首尔、釜山、继承人等默认模板元素，除非用户 seed 明确要求。" : "",
        ].filter(Boolean).join("\n"),
        seedText || "random-book-life"
      );
      const output = normalizeSeed(result.output, fallback);
      logTextStage(`generateSeed done title="${output.persona.title}" questions=${output.questionnaire.length}`);
      const seed = seedText?.trim();
      const leakedFallback = /韩国|财阀|首尔|釜山|汉南洞/.test(JSON.stringify(output));
      if (seed && !/韩国|财阀|首尔|釜山|汉南洞/.test(seed) && leakedFallback) {
        throw new Error(`Generated seed leaked default Korean chaebol fallback for seed: ${seed}`);
      }
      return { ...result, output };
    } catch (error) {
      throw new Error(`Life book seed generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateAutonomousDecisions(input: { persona: LifePersona; questionnaire: LifeDecisionQuestion[] }): Promise<LifeBookTextResult<LifeSelectedDecision[]>> {
    const fallback = input.questionnaire.map((question, index) => ({ questionId: question.questionId, optionId: question.options[index % question.options.length]?.choiceId || question.options[0].choiceId }));
    logTextStage(`generateAutonomousDecisions start questions=${input.questionnaire.length}`);
    try {
      const result = await callText<AutonomousDecisionPlan>(
        "自动选择一条最有戏剧张力的人生路线",
        [
          "你要替用户过完这一生。请为每个 question 选择一个 option，形成最曲折、最有命运感、最适合改编成故事书的一生路线。",
          "不要总选安全选项；要让人生有上升、误判、代价、关系反转和晚年回响。",
          "输出 JSON：{decisions:[{questionId,optionId,reason}]}。",
          `persona: ${JSON.stringify(input.persona)}`,
          `questionnaire: ${JSON.stringify(input.questionnaire)}`,
        ].join("\n"),
        input.persona.title
      );
      const valid = result.output.decisions
        .map((item) => {
          const question = input.questionnaire.find((q) => q.questionId === item.questionId);
          const option = question?.options.find((o) => o.choiceId === item.optionId);
          return question && option ? { questionId: question.questionId, optionId: option.choiceId } : null;
        })
        .filter((item): item is LifeSelectedDecision => Boolean(item));
      const output = valid.length === input.questionnaire.length ? valid : fallback;
      logTextStage(`generateAutonomousDecisions done selected=${output.length}`);
      return { ...result, output };
    } catch (error) {
      throw new Error(`Life book autonomous decision generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateScript(input: { persona: LifePersona; initialState: LifeState; questionnaire: LifeDecisionQuestion[]; selectedDecisions: LifeSelectedDecision[] }): Promise<LifeBookTextResult<CompleteLifeScript>> {
    const fallback = fallbackScript(input.persona, input.questionnaire, input.selectedDecisions);
    logTextStage(`generateScript start persona="${input.persona.title}" questions=${input.questionnaire.length}`);
    try {
      const overviewResult = await callText<Partial<LifeBookScriptOverview>>(
        "先生成整本人生故事书的大纲，不写正文",
        [
          "用户已经一次性选完人生关键节点。请先设计整本人生故事书的大纲，只写结构，不写长正文。",
          "输出 JSON：{title,logline,worldview,lifeArc,relationshipArc,chapters,ending,epitaph,scores}。",
          "chapters 每章字段：chapterIndex,title,ageRange,selectedChoiceLabel,summary,characterMoment,emotionalTurn,consequence,cliffhanger。不要输出 chapter.fullText，不要输出 pages。",
          "每章 summary 要明确该阶段的时代背景、地点、核心冲突、选择代价、关系变化和下一章伏笔。",
          "整本书要有长线伏笔：早年选择如何在中年反噬，亲密关系如何被阶层/金钱/理想改写，晚年如何回收主题。",
          "必须响应每个 selectedDecision，不能跳过选择，不能重复章节冲突。",
          `persona: ${JSON.stringify(input.persona)}`,
          `initialState: ${JSON.stringify(input.initialState)}`,
          `questionnaire: ${JSON.stringify(input.questionnaire)}`,
          `selectedDecisions: ${JSON.stringify(input.selectedDecisions)}`,
          "必须严格继承 persona 的国家、时代、地点、身份和职业；不得擅自改成韩国财阀、首尔、釜山、继承人等默认模板元素，除非 persona 明确要求。",
        ].join("\n"),
        `${input.persona.title}:overview`
      );
      const overviewChapters = overviewResult.output.chapters?.map((chapter, index) => ({
        ...fallback.chapters[index % fallback.chapters.length],
        ...chapter,
        fullText: fallback.chapters[index % fallback.chapters.length].fullText,
        pages: fallback.chapters[index % fallback.chapters.length].pages,
      }));
      const overview = normalizeScript({ ...overviewResult.output, chapters: overviewChapters, fullText: undefined }, fallback, input.persona);
      logTextStage(`generateScript overview done title="${overview.title}" chapters=${overview.chapters.length}`);
      const chapters: CompleteLifeChapter[] = [];
      for (let index = 0; index < overview.chapters.length; index += 1) {
        const chapterPlan = overview.chapters[index];
        logTextStage(`generateScript chapter_start ${index + 1}/${overview.chapters.length} title="${chapterPlan.title}"`);
        const question = input.questionnaire[index] || input.questionnaire[input.questionnaire.length - 1];
        const selected = input.selectedDecisions.find((item) => item.questionId === question?.questionId);
        const option = question?.options.find((item) => item.choiceId === selected?.optionId) ?? question?.options[0];
        const previousChapter = chapters[index - 1];
        const nextPlan = overview.chapters[index + 1];
        const chapterResult = await callText<Partial<CompleteLifeChapter>>(
          `生成第 ${index + 1} 章完整正文和分镜页`,
          [
            "请只生成这一章，不要重写整本书。输出 JSON：{chapterIndex,title,ageRange,selectedChoiceLabel,summary,fullText,characterMoment,emotionalTurn,consequence,cliffhanger,pages}。",
            "本章 fullText 至少 5000 中文字，必须是可直接阅读的传记文学正文；要分段，要有场景推进、人物对白、潜台词、关系变化、选择代价、时代细节、反转、伏笔回收。不要写提纲，不要流水账。",
            "正文结构建议：开场具体场景 → 选择前的压力 → 做出选择的动作和对白 → 短期回报 → 关系裂痕 → 数年后反噬 → 章节结尾的命运钩子。",
            "pages 生成 4-6 页，每页字段：pageIndex,title,caption,sceneText,imagePrompt,negativePrompt。",
            "每一页必须对应本章 fullText 中一个不同的具体剧情瞬间，不能只是角色肖像或泛泛氛围图。",
            "sceneText 必须写清楚：地点、时间、人物、正在发生的动作、冲突关系、关键道具、情绪张力、剧情后果。至少 120-220 中文字。",
            "imagePrompt 必须严格根据 sceneText 写画面：谁在什么地点做什么，旁边有哪些人，人物姿态/表情/道具/环境细节是什么，画面要能一眼看出这一页剧情，不得只有风格词。",
            "同一章节的 pages 要覆盖不同镜头：开场环境、选择瞬间、关系冲突、代价显现、伏笔/转场；禁止每页都生成相似半身肖像。",
            "所有 imagePrompt 必须是真人电影剧照风格：live-action cinematic still, photorealistic human faces, 35mm film still, consistent cinematography, film grain, realistic costume and production design。",
            "所有 imagePrompt 必须明确禁止 anime/manga/cartoon/2D illustration/3D render/CGI/game art，并强调每页像同一部电影里的连续画面，不能画风漂移。",
            `bookOverview: ${JSON.stringify({ title: overview.title, logline: overview.logline, worldview: overview.worldview, lifeArc: overview.lifeArc, relationshipArc: overview.relationshipArc, ending: overview.ending, epitaph: overview.epitaph })}`,
            `chapterPlan: ${JSON.stringify(chapterPlan)}`,
            previousChapter ? `previousChapterSummary: ${JSON.stringify({ title: previousChapter.title, consequence: previousChapter.consequence, cliffhanger: previousChapter.cliffhanger })}` : "previousChapterSummary: null",
            nextPlan ? `nextChapterPlan: ${JSON.stringify(nextPlan)}` : "nextChapterPlan: null",
            `persona: ${JSON.stringify(input.persona)}`,
            `initialState: ${JSON.stringify(input.initialState)}`,
            `question: ${JSON.stringify(question)}`,
            `selectedDecision: ${JSON.stringify(selected)}`,
            `selectedOption: ${JSON.stringify(option)}`,
            "必须严格继承 persona 的国家、时代、地点、身份和职业；不得擅自改成韩国财阀、首尔、釜山、继承人等默认模板元素，除非 persona 明确要求。",
          ].filter(Boolean).join("\n"),
          `${input.persona.title}:chapter-${index + 1}`
        );
        const normalized = normalizeScript({ chapters: [{ ...chapterPlan, ...chapterResult.output }] }, fallback, input.persona).chapters[0];
        logTextStage(`generateScript chapter_done ${index + 1}/${overview.chapters.length} title="${normalized.title}" chars=${normalized.fullText.length} pages=${normalized.pages.length}`);
        chapters.push({ ...normalized, chapterIndex: index + 1 });
      }
      const output = normalizeScript({ ...overview, chapters, fullText: chapters.map((chapter) => `## ${chapter.title}\n\n${chapter.fullText}`).join("\n\n") }, fallback, input.persona);
      logTextStage(`generateScript done title="${output.title}" chapters=${output.chapters.length} chars=${output.fullText.length}`);
      const scriptText = JSON.stringify(output);
      const personaText = JSON.stringify(input.persona);
      if (!/韩国|财阀|首尔|釜山|汉南洞/.test(personaText) && /韩国|财阀|首尔|釜山|汉南洞/.test(scriptText)) {
        throw new Error(`Generated script leaked default Korean chaebol fallback for persona: ${input.persona.title}`);
      }
      return { output, modelAlias: overviewResult.modelAlias, inputSummary: input.persona.title };
    } catch (error) {
      throw new Error(`Life book script generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function extractAge(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{1,3})/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function defaultAgeForIndex(index: number, total: number, initialAge: number): number {
  if (total <= 1) return initialAge;
  const finalAge = 78;
  return Math.round(initialAge + ((finalAge - initialAge) * index) / (total - 1));
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferStageMeta(q: Partial<LifeDecisionQuestion>, index: number, total: number, initialAge: number): Pick<LifeDecisionQuestion, "lifeAge" | "stageTitle" | "setup" | "stakes"> {
  const targetAge = defaultAgeForIndex(index, total, initialAge);
  const optionText = (q.options ?? []).map((o) => [textValue(o.label), textValue(o.description), textValue(o.longTermRisk)].join(" ")).join(" ");
  const age = extractAge(q.lifeAge);
  const previousMax = index === 0 ? 0 : defaultAgeForIndex(index - 1, total, initialAge);
  const validAge = age !== null && age > previousMax ? age : targetAge;
  const late = validAge >= 55;
  const middle = validAge >= 38 && validAge < 55;
  const adult = validAge >= 25 && validAge < 38;
  const youth = validAge < 25;
  let title = textValue(q.stageTitle);
  if (!title || (index >= 5 && /第一次|少年|归来|第一份/.test(title))) {
    if (/生育|继承|单亲|冷冻|接班/.test(optionText)) title = "晚年：继承人与孤独";
    else if (/裁员|转型|出售|员工|业务/.test(optionText)) title = "中晚年：集团转型的代价";
    else if (late) title = "晚年：遗产、审判与继承";
    else if (middle) title = "中年：权力中心的代价";
    else if (adult) title = "成年：联盟、事业与背叛";
    else if (youth) title = "青年：第一次真正下注";
    else title = "少年：命运开局";
  }
  let setup = textValue(q.setup);
  if (!setup || (index >= 5 && /偷听|海外归来/.test(setup))) {
    setup = `${validAge}岁时，前面所有选择的后果开始集中回到你身上。${optionText.slice(0, 80)}成为这一阶段无法回避的命题。`;
  }
  let stakes = textValue(q.stakes);
  if (!stakes) stakes = "这个选择会改变后半生的权力结构、亲密关系和最终遗产。";
  return { lifeAge: `${validAge}岁`, stageTitle: title, setup, stakes };
}

function isGenericModernFallback(value?: string): boolean {
  return Boolean(value && /近现代中国社会转型期|普通城市劳动者|新兴职业阶层|1980年前后/.test(value));
}

function normalizePersona(rawPersona: Partial<LifePersona> | undefined, fallback: LifeBookSeedResult, initialState: LifeState): LifePersona {
  const persona = { ...fallback.persona, ...(rawPersona ?? {}) };
  const stateExtra = initialState as LifeState & { era?: unknown };
  const stateEra = typeof stateExtra.era === "string" ? stateExtra.era.trim() : "";
  const stateLocation = typeof initialState.location === "string" ? initialState.location.trim() : "";
  const historicalHint = `${persona.title}${persona.identity}${persona.coreTension}${stateEra}${stateLocation}`;

  if (!persona.era || isGenericModernFallback(persona.era)) {
    persona.era = stateEra || fallback.persona.era;
  }
  if (!persona.location || isGenericModernFallback(persona.location) || persona.location === persona.era) {
    persona.location = stateLocation || fallback.persona.location;
  }
  if (!persona.socialClass || (/大唐|唐朝|天宝|陇右|边军|斥候|府兵/.test(historicalHint) && isGenericModernFallback(persona.socialClass))) {
    persona.socialClass = fallback.persona.socialClass;
  }
  if (persona.birthYear && /大唐|唐朝|天宝/.test(historicalHint) && isGenericModernFallback(persona.birthYear)) {
    persona.birthYear = fallback.persona.birthYear;
  }
  persona.visualAnchor = persona.visualAnchor
    .replace(/近现代中国社会转型期/g, persona.era)
    .replace(/普通城市劳动者 \/ 新兴职业阶层/g, persona.socialClass);
  return persona;
}

function normalizeSeed(raw: Partial<LifeBookSeedResult>, fallback: LifeBookSeedResult): LifeBookSeedResult {
  const initialState = { ...fallback.initialState, ...(raw.initialState ?? {}) };
  const persona = normalizePersona(raw.persona, fallback, initialState);
  const rawQuestions = Array.isArray(raw.questionnaire) && raw.questionnaire.length ? raw.questionnaire : fallback.questionnaire;
  const total = rawQuestions.length;
  let lastAge = 0;
  const questionnaire = rawQuestions.map((q, qi) => {
    const fallbackQuestion = fallback.questionnaire[Math.min(qi, fallback.questionnaire.length - 1)];
    const meta = inferStageMeta(q, qi, total, initialState.age || 12);
    let age = extractAge(meta.lifeAge) ?? defaultAgeForIndex(qi, total, initialState.age || 12);
    if (age <= lastAge) age = lastAge + (qi >= total - 2 ? 8 : 5);
    lastAge = age;
    const options = (q.options?.length ? q.options : fallbackQuestion.options).map((o, oi) => ({
      ...fallbackQuestion.options[oi % fallbackQuestion.options.length],
      ...o,
      choiceId: o.choiceId || createId("book_choice"),
    }));
    return {
      ...fallbackQuestion,
      ...q,
      ...meta,
      lifeAge: `${age}岁`,
      questionId: q.questionId || createId("question"),
      options,
    };
  });
  return { persona, initialState, questionnaire };
}

function makePage(index: number, title: string, caption: string, sceneText: string, persona: LifePersona): LifeBookPage {
  const detailedScene = `${sceneText}。画面必须展现这一页的具体剧情动作，而不是泛泛肖像：明确地点、人物互动、关键道具、冲突关系和情绪后果。`;
  return {
    pageId: createId("book_page"), pageIndex: index, title, caption, sceneText: detailedScene,
    imagePrompt: [
      `Story moment: ${detailedScene}`,
      `Protagonist and world: ${persona.visualAnchor}; ${persona.era}; ${persona.location}; ${persona.identity}`,
      "Compose a specific live-action cinematic scene that visibly tells this story beat. Show full environment, body language, other relevant characters, props, and consequences. Avoid generic portrait or repetitive standing pose.",
      "live-action cinematic still, photorealistic human face, same movie visual style, 35mm film still, anamorphic lens, cinematic lighting, realistic costume and production design, film grain, no text, no watermark, not anime, not illustration, not 3D render",
    ].join("\n"),
    negativePrompt: "generic portrait, repetitive half-body shot, empty scene, anime, manga, cartoon, 2d illustration, 3d render, cgi, pixar, game art, plastic skin, inconsistent art style, text, watermark, logo, low quality",
    generationStatus: "pending",
  };
}

function fallbackScript(persona: LifePersona, questionnaire: LifeDecisionQuestion[], selectedDecisions: LifeSelectedDecision[]): CompleteLifeScript {
  const chapters: CompleteLifeChapter[] = questionnaire.map((q, index) => {
    const selected = selectedDecisions.find((item) => item.questionId === q.questionId);
    const option = q.options.find((item) => item.choiceId === selected?.optionId) ?? q.options[0];
    return {
      chapterId: createId("chapter"), chapterIndex: index + 1, title: q.stageTitle, ageRange: q.lifeAge, selectedChoiceLabel: option.label,
      summary: `${q.setup}\n你选择了「${option.label}」：${option.description}。这个选择短期带来${option.shortTermTradeoff}，但长期埋下${option.longTermRisk}。`,
      fullText: `${q.lifeAge}，${q.stageTitle}。${q.setup}\n\n你选择了「${option.label}」。这不是一个简单的方向，而是一种把自己交给命运审判的方式。${option.description}\n\n最初的回报来得很快：${option.shortTermTradeoff}。但真正改变人生的，从来不是当场兑现的利益，而是几年后才开始反噬的细节。${option.longTermRisk}\n\n在这一章里，你和身边人的关系发生了微妙变化。有人开始信任你，有人开始防备你，也有人在沉默中把你当作未来可以利用的筹码。${option.hiddenForeshadowing}`,
      characterMoment: `你在${q.lifeAge}第一次意识到，自己不是单纯的受害者，也不是完全自由的人。`,
      emotionalTurn: `你在${q.lifeAge}第一次理解：自由不是没有代价，而是选择由谁来支付代价。`,
      consequence: option.hiddenForeshadowing,
      cliffhanger: "这个选择没有结束，它只是换了一种方式潜伏到下一章。",
      pages: [
        makePage(1, q.stageTitle, q.setup, `主角站在${persona.location}的关键场景中，面临「${option.label}」的抉择`, persona),
        makePage(2, "选择", option.description, `选择发生的瞬间，周围人物的表情、阶级秩序和时代细节同时压向主角`, persona),
        makePage(3, "代价", option.longTermRisk, `数年后，这个选择的代价以一封信、一次会议、一次审判或一次别离的形式出现`, persona),
        makePage(4, "余波", option.hiddenForeshadowing, `命运继续向下一章推进，主角带着新的伤痕和筹码离开画面`, persona),
      ],
    };
  });
  return {
    title: `${persona.title}：完整人生故事书`,
    logline: persona.coreTension,
    worldview: `${persona.era} / ${persona.location} / ${persona.socialClass}`,
    lifeArc: "一个被时代和身份预先定价的人，试图把每一次被安排的选择改造成自己的命运。",
    relationshipArc: "亲情、利益、爱情和权力在一生中不断交换位置。",
    fullText: chapters.map((chapter) => `## ${chapter.title}\n\n${chapter.fullText}`).join("\n\n"),
    chapters,
    ending: "晚年回望时，主角终于明白：人生不是胜利或失败，而是每一次选择的代价如何留在别人身上。",
    epitaph: "他/她曾被命运书写，也曾在缝隙里反写命运。",
    scores: [{ label: "自由", value: 62 }, { label: "权力", value: 74 }, { label: "遗憾", value: 81 }, { label: "历史影响", value: 58 }],
  };
}

function normalizeScript(raw: Partial<CompleteLifeScript>, fallback: CompleteLifeScript, persona: LifePersona): CompleteLifeScript {
  const chapters = Array.isArray(raw.chapters) && raw.chapters.length ? raw.chapters : fallback.chapters;
  const normalizedChapters = chapters.map((chapter, index) => ({
      ...fallback.chapters[index % fallback.chapters.length],
      ...chapter,
      chapterId: chapter.chapterId || createId("chapter"),
      chapterIndex: chapter.chapterIndex || index + 1,
      fullText: chapter.fullText || fallback.chapters[index % fallback.chapters.length].fullText,
      characterMoment: chapter.characterMoment || fallback.chapters[index % fallback.chapters.length].characterMoment,
      cliffhanger: chapter.cliffhanger || fallback.chapters[index % fallback.chapters.length].cliffhanger,
      pages: (chapter.pages?.length ? chapter.pages : fallback.chapters[index % fallback.chapters.length].pages).map((page, pageIndex) => ({
        ...makePage(pageIndex + 1, chapter.title || "人生章节", chapter.summary || "", chapter.consequence || "", persona),
        ...page,
        pageId: page.pageId || createId("book_page"),
        pageIndex: page.pageIndex || pageIndex + 1,
        generationStatus: page.generationStatus || "pending",
      })),
    }));
  return {
    ...fallback,
    ...raw,
    fullText: raw.fullText || normalizedChapters.map((chapter) => `## ${chapter.title}\n\n${chapter.fullText}`).join("\n\n"),
    chapters: normalizedChapters,
    scores: Array.isArray(raw.scores) && raw.scores.length ? raw.scores : fallback.scores,
  };
}

export const lifeBookTextModel = new LifeBookTextAdapter();
