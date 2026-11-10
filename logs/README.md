# logs/

Session logs from the AI coding tools used to build this project, collected for hand-off as the brief requires. They are not committed to the public repository (see `.gitignore`); hand them over with the source folder.

- `claude-code/` — Claude Code transcripts for this workspace (JSONL, one file per session; the main build session is the largest file). Includes every prompt, tool call, file edit, and the user's messages.
- `codex-astra/` — logs of the Codex (gpt-6-astra) review and research runs that were invoked from Claude Code, one file per run.

To refresh after more work:

```sh
cp ~/.claude/projects/-Users-shu-builder-interview/*.jsonl logs/claude-code/
cp ~/.claude/plugins/data/codex-openai-codex/state/builder-interview-*/jobs/*.log logs/codex-astra/
```
