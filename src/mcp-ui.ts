export const DRAW2CODE_UI_URI = 'ui://draw2code/canvas.html'

/**
 * MCP Apps shell. The actual Excalidraw app stays daemon-served so the same
 * client is reused by DSH, Codex and browser fallback. Hosts that prohibit
 * localhost subframes still expose the explicit browser link.
 */
export const DRAW2CODE_UI_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,#app{height:100%;margin:0}body{font:14px system-ui;background:#f6f6f8;color:#242428}.empty{height:100%;display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}.empty a{color:#4c6ef5}iframe{border:0;width:100%;height:100%;background:white}</style></head>
<body><div id="app"><div class="empty">正在连接 Draw2Code…</div></div>
<script>
const app=document.getElementById('app');
function render(output){
  const data=output?.data??output;
  if(!data?.url){app.innerHTML='<div class="empty">画板尚未就绪。你仍可在对话中继续 Create、Update 或 Generate。</div>';return}
  const frame=document.createElement('iframe');frame.src=data.url;frame.title='Draw2Code 画板';frame.allow='clipboard-read; clipboard-write';
  frame.onerror=()=>{app.innerHTML='<div class="empty">宿主阻止了本地内嵌画板。<a target="_blank" rel="noreferrer">在浏览器打开</a></div>';app.querySelector('a').href=data.url};
  app.replaceChildren(frame);
}
window.addEventListener('message',(event)=>{const m=event.data;if(!m||m.jsonrpc!=='2.0')return;if(m.method==='ui/notifications/tool-result')render(m.params?.structuredContent)});
if(window.openai?.toolOutput)render(window.openai.toolOutput);
</script></body></html>`
