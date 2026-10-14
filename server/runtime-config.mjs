import path from 'node:path';
// Desktop bootstrap passes trusted paths directly; packaged services never fall
// back to the caller's working directory or an inherited test configuration.
const desktop=globalThis[Symbol.for('streamdesk.runtime')];
const data=desktop?.data||process.env.STREAMDESK_DATA;
export const runtimeConfig=Object.freeze({
 desktop:!!desktop,dataRoot:path.resolve(data||'data'),
 sourceFile:path.resolve(desktop?path.join(desktop.data,'sources.json'):process.env.STREAMDESK_SOURCES||path.join(data||'data','sources.json')),
 sourceRequired:!!desktop||!!process.env.STREAMDESK_SOURCES,defaults:!desktop&&!data&&!process.env.STREAMDESK_SOURCES,
 securityFile:path.resolve(desktop?path.join(desktop.data,'security.json'):process.env.STREAMDESK_SECURITY||path.join(data||'data','security.json')),
 resultCacheFile:path.resolve(desktop?path.join(desktop.data,'catalog-results.json'):process.env.STREAMDESK_RESULT_CACHE||path.join(data||'data','catalog-results.json')),
 distRoot:path.resolve(desktop?.dist||process.env.STREAMDESK_DIST||'dist'),
 port:Number(desktop?.port||process.env.PORT||4173),host:desktop?'127.0.0.1':process.env.HOST||'127.0.0.1'
});
