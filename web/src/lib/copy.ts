export const copy = {
  brand: "Averie 做饭档案",
  nav: {
    cooked: "做过的",
    wantCook: "想做的",
    wantEat: "想吃的",
  },
  empty: {
    cooked: "还没记下第一道菜。做完一顿，回来留个脚印吧。",
    wantCook: "以后想试的菜，先收在这里。",
    wantEat: "还没有人点「想吃」。看好的，点一下就留在这。",
  },
  btn: {
    wantEat: "想吃",
    cancelWantEat: "取消想吃",
    wanted: "已想吃",
    rate: "评个分",
    rerate: "改评分",
    submit: "提交",
    login: "站长登录",
    logout: "退出",
    detail: "查看详情",
    back: "返回",
    retry: "再试一次",
  },
  lock: {
    title: "完整食谱仅站长可见。",
    sub: "登录后才能打开步骤与用料；访客可以浏览简介、评分，并点「想吃」。",
  },
  rating: {
    none: "暂无评分",
    unit: "分",
    title: "这道菜怎么样",
  },
  wantEatCount: (n: number) => `${n} 人想吃`,
  loadError: "没加载出来，再试一次？",
  loginHint: "只有站长能改档案、看完整食谱",
  cookedMark: "做过",
} as const;
