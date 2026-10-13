import fs from 'node:fs/promises';import path from 'node:path';
const [data,dist,port]=process.argv.slice(2);
if(!data||!path.isAbsolute(data)||!dist||!path.isAbsolute(dist)||!/^\d+$/.test(port||''))throw Error('客户端服务启动参数无效');
// Establish paths inside the child before importing any configuration readers.
process.env.STREAMDESK_DATA=data;process.env.STREAMDESK_SOURCES=path.join(data,'sources.json');process.env.STREAMDESK_DIST=dist;process.env.STREAMDESK_RESULT_CACHE=path.join(data,'catalog-results.json');process.env.STREAMDESK_SECURITY=path.join(data,'security.json');process.env.PORT=port;process.env.HOST='127.0.0.1';
await fs.access(process.env.STREAMDESK_SOURCES);
await import('../runtime/server.mjs');
