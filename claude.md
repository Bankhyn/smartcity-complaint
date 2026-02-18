# NoomAgent v4.0 — Setup บน Notebook

## Step 1: ติดตั้ง Software

### 1.1 Node.js (v18+)
```bash
# ดาวน์โหลดจาก https://nodejs.org/ (LTS)
# หรือ
winget install OpenJS.NodeJS.LTS
```

### 1.2 PM2 (Process Manager)
```bash
npm install -g pm2
```

### 1.3 tsx (TypeScript runtime)
```bash
npm install -g tsx
```

### 1.4 Claude CLI (สมองหลัก)
```bash
npm install -g @anthropic-ai/claude-code
# แล้ว login:
claude
# จะเปิด browser ให้ login ด้วย Anthropic account (Pro Max plan)
```

### 1.5 Ollama (Local LLM สำหรับ embedding) — Optional
```bash
# ดาวน์โหลดจาก https://ollama.com/download
# หรือ
winget install Ollama.Ollama

# ติดตั้ง models:
ollama pull nomic-embed-text
ollama pull llama3.2:3b
```

### 1.6 Python 3.12 (สำหรับ MCP Memory) — Optional
```bash
winget install Python.Python.3.12
pip install mcp-memory-service
```

---

## Step 2: Copy NoomAgent

### 2.1 Copy folder ทั้งหมด (ยกเว้น)
```bash
# Copy จาก PC:
# E:\NoomAgent\ → Notebook

# ไม่ต้อง copy:
# - node_modules/     (npm install ให้)
# - dist/             (build ให้)
# - data/sessions/    (runtime state)
# - backups/          (auto-generated)
```

### 2.2 Install dependencies
```bash
cd NoomAgent
npm install
```

### 2.3 TypeScript check
```bash
npx tsc --noEmit
```

---

## Step 3: Setup Claude Code (MCP Servers + Settings)

### 3.1 สร้างไฟล์ settings.json
**Path:** `C:\Users\<USERNAME>\.claude\settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "git status --short 2>/dev/null && echo '---' && git log --oneline -3 2>/dev/null || echo 'Not a git repo'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "case \"$CLAUDE_TOOL_INPUT_command\" in *'rm -rf /'*|*'DROP DATABASE'*|*'DROP TABLE'*|*'format c:'*|*'del /s /q c:'*) exit 1;; *) exit 0;; esac"
          }
        ]
      }
    ],
    "Stop": []
  },
  "mcpServers": {
    "memory": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "mcp_memory_service.server"],
      "env": {
        "MEMORY_DB_PATH": "C:\\Users\\<USERNAME>\\mcp-memory\\sqlite_vec.db"
      }
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "sequential-thinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_GITHUB_TOKEN>"
      }
    },
    "tavily": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "<YOUR_TAVILY_KEY>"
      }
    },
    "brave-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "<YOUR_BRAVE_KEY>"
      }
    },
    "firecrawl": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "<YOUR_FIRECRAWL_KEY>"
      }
    }
  }
}
```

> **สำคัญ:** แก้ `<USERNAME>` เป็น username ของ notebook + ใส่ API keys

### 3.2 สร้าง CLAUDE.md (Global)
**Path:** `C:\Users\<USERNAME>\.claude\CLAUDE.md`

Copy จาก PC: `C:\Users\5-17-7-2023\.claude\CLAUDE.md`

---

## Step 4: Setup .env
```bash
cd NoomAgent
# แก้ .env — ใส่ API keys:
# TAVILY_API_KEY=tvly-dev-xxx
# BRAVE_SEARCH_API_KEY=BSAxxx
```

---

## Step 5: แก้ ecosystem.config.cjs (เปลี่ยน path)

แก้ `cwd` ให้ตรงกับ path บน notebook:
```javascript
module.exports = {
  apps: [
    {
      name: 'noom-agent',
      script: 'gateway/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: 'C:\\Users\\<USERNAME>\\NoomAgent',  // ← แก้ตรงนี้
      watch: false,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      cron_restart: '0 3 * * *',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

---

## Step 6: Run!

### Development mode:
```bash
cd NoomAgent
npm run dev
# → http://localhost:3100
```

### Production mode (PM2):
```bash
cd NoomAgent
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # auto-start เมื่อเปิดเครื่อง
```

---

## MCP Servers สรุป

| MCP Server | ทำอะไร | จำเป็น? |
|------------|--------|---------|
| **memory** | Long-term memory (SQLite vector) | แนะนำ |
| **playwright** | Browser automation | แนะนำ |
| **tavily** | Web search (primary) | แนะนำ |
| **brave-search** | Web search (secondary) | Optional |
| **github** | GitHub API access | Optional |
| **sequential-thinking** | Chain-of-thought reasoning | Optional |
| **context7** | Library documentation lookup | Optional |
| **firecrawl** | Web scraping | Optional |

### ติดตั้ง MCP Memory:
```bash
pip install mcp-memory-service
mkdir C:\Users\<USERNAME>\mcp-memory
```

---

## API Keys ที่ต้องมี

| Service | Free Tier | Get Key |
|---------|-----------|---------|
| Tavily | 1,000 credits/mo | https://app.tavily.com/ |
| Brave Search | 2,000 req/mo | https://api.search.brave.com/app/keys |
| Firecrawl | 500 credits/mo | https://firecrawl.dev/ |
| GitHub | Unlimited | https://github.com/settings/tokens |

---

## Verify ทุกอย่างพร้อม

```bash
# 1. Node
node --version        # ≥ v18

# 2. Claude CLI
claude --version      # ต้อง login แล้ว

# 3. NoomAgent
cd NoomAgent
npx tsc --noEmit      # 0 errors
npm run dev           # เปิด http://localhost:3100

# 4. Ollama (optional)
ollama list           # nomic-embed-text + llama3.2:3b

# 5. MCP Memory (optional)
python -m mcp_memory_service.server --help
```

---

## Troubleshooting

| ปัญหา | แก้ |
|--------|-----|
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` |
| `EADDRINUSE 3100` | `npx kill-port 3100` |
| `better-sqlite3 build error` | `npm rebuild better-sqlite3` |
| `tsx not found` | `npm install -g tsx` |
| `Ollama connection refused` | เปิด Ollama app ก่อน |
| Python import error | `pip install mcp-memory-service` |
