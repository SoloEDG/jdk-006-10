# 雾港来电 · 午夜频率

## 安装

使用 Node.js 22.12 或更新版本。

```sh
npm ci
```

## 本地启动

```sh
npm run dev
```

打开终端显示的本地地址。

## Docker 启动

```sh
docker compose up --build
```

打开 http://localhost:8086 。可通过 PORT 环境变量修改端口。

## 离线案件包

朋友制作的案件可以打包成单个 JSON 文件，在「案件库 → 导入案件包」中导入。导入前会检查完整性并展示摘要与资源大小，检查通过后作为独立案件离线收听；案件标识相同但内容不同的包会并存，互不影响。

```jsonc
{
  "format": "midnight-frequency/case-bundle",
  "version": 1,
  "case": {
    "id": "my-case",           // 案件标识
    "title": "案件标题",
    "summary": "案件摘要",
    "start": "第一个场景 id",   // 可选，默认首个场景
    "endings": ["结局场景 id"], // 可选，默认无分支的场景
    "scenes": [
      {
        "id": "dock",
        "title": "渡口",
        "location": "山城",
        "chapter": "01",
        "description": "……",
        "choices": [
          { "id": "go", "label": "前进", "target": "end", "requires": ["线索id"], "description": "……" }
        ]
      }
    ],
    "episodes": [
      {
        "id": "dock-main",
        "sceneId": "dock",
        "title": "渡口录音",
        "version": "原始录音",
        "description": "……",
        "audio": "audio/dock.wav",   // 必须是包内相对路径，禁止远端地址
        "duration": 8,
        "requires": ["线索id"],       // 可选：掌握线索后替换默认录音
        "cues": [
          {
            "id": "line-1", "speaker": "旁白", "text": "……",
            "start": 0, "end": 3,
            "sound": { "clueId": "线索id", "start": 1, "end": 2, "description": "可疑声音" }
          }
        ],
        "wave": [0.2, 0.6]
      }
    ],
    "clues": [{ "id": "线索id", "title": "……", "kind": "环境声音", "description": "……" }]
  },
  "audio": {
    "audio/dock.wav": { "sha256": "文件内容的 SHA-256（hex）", "data": "base64 编码的音频" }
  }
}
```

包内每段声音都会按声明的 SHA-256 指纹核对；缺音频、字幕越界、循环死路（存在无法到达结局的场景）都会整包拒绝，不影响当前调查。
