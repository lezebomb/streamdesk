import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
const cache=path.resolve('.tooling/builder-cache');await fs.mkdir(cache,{recursive:true});await fs.writeFile(path.join(cache,'package.json'),'{"type":"commonjs"}');
const env={...process.env,electron_config_cache:path.resolve('.tooling/electron-cache'),ELECTRON_BUILDER_CACHE:cache};
execFileSync(process.execPath,['node_modules/electron/install.js'],{env,stdio:'inherit'});
execFileSync(process.execPath,['node_modules/electron-builder/cli.js','--win','nsis','--x64','--publish','never'],{env,stdio:'inherit'});
