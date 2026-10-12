// Public sample films; identity describes the work, never a promise of broad commercial coverage.
export const films=[
 {id:'bbb',canonicalId:'blender:big-buck-bunny',title:'大雄兔 Big Buck Bunny',year:'2008',category:'动漫',description:'Blender 开放电影。用于验证真实 HLS / MP4 播放、换源与缓冲。',hls:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',mp4:'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'},
 {id:'sintel',canonicalId:'blender:sintel',title:'辛特尔 Sintel',year:'2010',category:'动漫',description:'Blender 开放电影。完整影片，不同 CDN 的两种媒体格式。',hls:'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',mp4:'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'},
 {id:'tos',canonicalId:'blender:tears-of-steel',title:'钢铁之泪 Tears of Steel',year:'2012',category:'电影',description:'Blender 开放电影。真人与视觉特效测试影片。',hls:'https://test-streams.mux.dev/tos_ismc/main.m3u8',mp4:'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'}
];
export function catalog(source){
 if(source.catalog==='quality')return [{id:'apple-av1',sourceId:source.id,canonicalId:'apple:av1-example',title:'Apple · AV1 UHD 公开测试流',year:'2026',category:'测试流',description:'Apple 官方公开多码率测试，实际画质取决于流清单与当前设备。',episodes:[{key:'feature',label:'公开测试',kind:'hls',url:'https://devstreaming-cdn.apple.com/videos/streaming/examples/av1-sample/av1-sample.m3u8'}]}];
 if(source.catalog==='blender')return [{id:'sintel-trailer',sourceId:source.id,canonicalId:'blender:sintel-trailer',title:'辛特尔 Sintel · 预告片',year:'2010',category:'动漫',description:'Blender 官方公开预告片。与完整正片分别标识，不参与正片换源。',episodes:[{key:'trailer',label:'预告片',kind:'mp4',url:'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4'}]}];
 if(source.catalog==='backup')return films.filter(f=>f.id!=='sintel').map(f=>({...f,id:f.id,sourceId:source.id,episodes:[{key:'feature',label:'正片',kind:'hls',url:f.id==='bbb'?'https://test-streams.mux.dev/x36xhzz/url_6/193039199_mp4_h264_aac_hq_7.m3u8':'https://test-streams.mux.dev/tos_ismc/tos_1080p/index.m3u8'}]}));
 return films.filter(f=>source.catalog!=='hls'||f.id!=='sintel').map(f=>({id:f.id,sourceId:source.id,canonicalId:f.canonicalId,title:f.title,year:f.year,category:f.category,description:f.description,episodes:[{key:'feature',label:'正片',kind:source.catalog,url:f[source.catalog]}]}));
}
