const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('streamdeskClient',{platform:'windows',update:action=>ipcRenderer.invoke('sd:update',action),onUpdate:callback=>{const handler=(_,state)=>callback(state);ipcRenderer.on('sd:update-state',handler);return ()=>ipcRenderer.removeListener('sd:update-state',handler)}});
