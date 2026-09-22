const UPSTREAM = "https://yannnis.substack.com";
const FLAG = "ss=1";

const HOP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function withFlag(pathAndSearch: string): string {
  if (pathAndSearch.includes("ss=1")) return pathAndSearch;
  const queryAt = pathAndSearch.indexOf("?");
  const path = queryAt >= 0 ? pathAndSearch.slice(0, queryAt) : pathAndSearch;
  if (path === "" || path === "/") return pathAndSearch;
  return queryAt >= 0 ? `${pathAndSearch}&${FLAG}` : `${pathAndSearch}?${FLAG}`;
}

function toLocal(value: string, origin: string): string {
  if (value.startsWith(UPSTREAM)) return withFlag(`${value.slice(UPSTREAM.length)}` || "/");
  if (value.startsWith(origin)) return withFlag(value.slice(origin.length) || "/");
  if (value.startsWith("/") && !value.startsWith("//")) return withFlag(value);
  return value;
}

function rewriteText(body: string, contentType: string, origin: string): string {
  const host = new URL(origin).host;
  let next = body.split(UPSTREAM).join(origin);
  next = next.replaceAll('"hostname":"yannnis.substack.com"', `"hostname":"${host}"`);
  next = next.replaceAll('\\"hostname\\":\\"yannnis.substack.com\\"', `\\"hostname\\":\\"${host}\\"`);
  if (/text\/html/i.test(contentType)) {
    next = next.replace(
      /(href|src|action)=(["'])(\/(?!\/)[^"']*)\2/gi,
      (_match, attr: string, quote: string, raw: string) => `${attr}=${quote}${withFlag(raw)}${quote}`,
    );
    const keep = `<script>(function(){function flagged(url){try{var u=new URL(url,location.origin);if(u.hostname==="yannnis.substack.com"){u.protocol=location.protocol;u.host=location.host}if(u.origin!==location.origin)return url;var path=u.pathname.replace(/\\/{2,}/g,"/");if(path.charAt(0)!=="/")path="/"+path;if(path!=="/"&&!u.searchParams.has("ss"))u.searchParams.set("ss","1");return path+u.search+u.hash}catch(e){return url}}function tell(){try{parent.postMessage({type:"ss-path",path:location.pathname.replace(/\\/{2,}/g,"/")},location.origin)}catch(e){}}var f=window.fetch;window.fetch=function(input,init){if(typeof input==="string"&&input.charAt(0)==="/")input=flagged(input);return f.call(this,input,init)};var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(){var args=[].slice.call(arguments);if(typeof args[1]==="string"&&args[1].charAt(0)==="/")args[1]=flagged(args[1]);return open.apply(this,args)};var ps=history.pushState,rs=history.replaceState;history.pushState=function(s,t,url){if(typeof url==="string")url=flagged(url);var out=ps.call(this,s,t,url);tell();return out};history.replaceState=function(s,t,url){if(typeof url==="string")url=flagged(url);var out=rs.call(this,s,t,url);tell();return out};window.addEventListener("popstate",tell);document.addEventListener("click",function(e){var n=e.target&&e.target.closest&&e.target.closest("a");if(!n||!n.href)return;var u;try{u=new URL(n.href,location.origin)}catch(err){return}if(u.hostname==="yannnis.substack.com"||u.origin===location.origin){e.preventDefault();location.href=flagged(n.href)}},true);tell()})();</script>`;
    next = next.includes("</head>") ? next.replace("</head>", `${keep}</head>`) : keep + next;
  } else if (/json/i.test(contentType)) {
    next = next.replace(/"(https?:\/\/[^"]+)"/g, (match, url: string) => {
      if (!url.startsWith(origin)) return match;
      const local = url.slice(origin.length) || "/";
      return `"${origin}${withFlag(local)}"`;
    });
  }
  return next;
}

export async function proxySubstack(request: Request, path: string[] | undefined): Promise<Response> {
  const incoming = new URL(request.url);
  const origin = publicOrigin(request);
  const safe = (path ?? []).filter((part) => part !== "" && part !== "." && part !== "..");
  const target = `${UPSTREAM}${safe.length ? `/${safe.join("/")}` : "/"}${incoming.search}`;
  const headers = new Headers();
  for (const name of ["cookie", "accept", "user-agent", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    return new Response(null, { status: response.status, headers: { location: toLocal(location, origin) } });
  }

  const type = response.headers.get("content-type") || "";
  const outgoing = new Headers();
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP.has(lower) || lower === "set-cookie" || lower === "content-security-policy") return;
    outgoing.set(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookieValue of cookies) {
    outgoing.append("set-cookie", cookieValue.replace(/;\s*Domain=[^;]*/i, ""));
  }

  if (/text\/html|text\/css|javascript|json/i.test(type)) {
    outgoing.set("content-type", type);
    outgoing.set("cache-control", "no-store");
    return new Response(rewriteText(await response.text(), type, origin), { status: response.status, headers: outgoing });
  }

  return new Response(await response.arrayBuffer(), { status: response.status, headers: outgoing });
}
