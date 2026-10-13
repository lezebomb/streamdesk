// Public distributions contain reusable code, never local sources or viewing evidence.
export function publicFile(file){
 const p=file.replaceAll('\\','/');if(/^(?:reports|research|artifacts|node_modules|dist|runtime|\.git|\.tooling)\//.test(p)||/^(?:design-qa\.md|\.env[^/]*)$/.test(p)&&p!=='.env.example')return false;
 if(/^data\//.test(p))return ['data/sources.example.json','data/cloud.example.json','data/quality-sources.json','data/native-config.example.json'].includes(p);
 if(/^docs\/validation/.test(p))return false;
 if(/^scripts\/(?:mobile-|probe-|provider-|frame-browser|verify-provider-docs|report|expansion-|iteration-0\.5|final-notes|real-failover|upgrade-history|soak)/.test(p))return false;
 return !/\.(?:jks|keystore|key|pem|p12|pfx|log)$/.test(p);
}
