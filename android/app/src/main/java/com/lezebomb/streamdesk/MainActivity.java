package com.lezebomb.streamdesk;

import android.app.Activity;import android.os.Bundle;import android.net.Uri;import android.content.Intent;import android.content.pm.PackageInfo;import android.content.pm.PackageManager;import android.view.View;import android.view.WindowManager;import android.webkit.*;import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;import androidx.webkit.WebViewCompat;import androidx.webkit.WebViewFeature;import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;import androidx.core.view.WindowCompat;import androidx.core.view.WindowInsetsCompat;import androidx.core.graphics.Insets;
import org.json.*;import java.io.*;import java.net.*;import java.nio.charset.StandardCharsets;import java.nio.file.Files;import java.nio.file.StandardCopyOption;import java.security.MessageDigest;import java.util.*;import java.util.concurrent.*;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net",HOME=ORIGIN+"/assets/index.html";
 private final ExecutorService workers=Executors.newFixedThreadPool(3);private WebView web;private FrameLayout root;private View fullScreen;private WebChromeClient.CustomViewCallback fullScreenCallback;
 private PosterCache posterCache;private JSONObject config;private JSONObject updateState;private JSONObject updateAsset;private File verifiedApk;
 @Override public void onCreate(Bundle state){super.onCreate(state);posterCache=new PosterCache(getCacheDir());try{prepareConfig();updateState=new JSONObject().put("state","idle").put("version",BuildConfig.VERSION_NAME);}catch(Exception e){throw new IllegalStateException("私人配置格式无效",e);}
  root=new FrameLayout(this);web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
  WindowCompat.setDecorFitsSystemWindows(getWindow(),false);root.setBackgroundColor(0xfff5faf9);
  WindowCompat.getInsetsController(getWindow(),root).setAppearanceLightStatusBars(true);WindowCompat.getInsetsController(getWindow(),root).setAppearanceLightNavigationBars(true);
  ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets)->{Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()),ime=insets.getInsets(WindowInsetsCompat.Type.ime());view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,ime.bottom));return WindowInsetsCompat.CONSUMED;});ViewCompat.requestApplyInsets(root);
  WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(false);
  final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){Uri u=request.getUrl();if(!request.isForMainFrame()){WebResourceResponse poster=posterCache.intercept(u.toString());if(poster!=null)return poster;}if(ORIGIN.equals(u.getScheme()+"://"+u.getHost())&&u.getPath().startsWith("/assets/private/"))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));WebResourceResponse response=assets.shouldInterceptRequest(u);if(response!=null){Map<String,String> headers=new HashMap<>();if(response.getResponseHeaders()!=null)headers.putAll(response.getResponseHeaders());headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; frame-src https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");headers.put("X-Content-Type-Options","nosniff");headers.put("Referrer-Policy","no-referrer");response.setResponseHeaders(headers);}return response;}
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return request.isForMainFrame()&&!request.getUrl().toString().startsWith(ORIGIN+"/assets/");}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
   @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){root.removeView(view);view.destroy();finish();return true;}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
   @Override public void onShowCustomView(View view,CustomViewCallback callback){if(fullScreen!=null){callback.onCustomViewHidden();return;}fullScreen=view;fullScreenCallback=callback;web.setVisibility(View.GONE);root.addView(view,new FrameLayout.LayoutParams(-1,-1));getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);}
   @Override public void onHideCustomView(){if(fullScreen==null)return;root.removeView(fullScreen);fullScreen=null;web.setVisibility(View.VISIBLE);getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);fullScreenCallback.onCustomViewHidden();}
  });
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))throw new IllegalStateException("系统 WebView 需要更新才能安全运行 StreamDesk");
  WebViewCompat.addWebMessageListener(web,"streamdeskNative",Collections.singleton(ORIGIN),(view,message,origin,mainFrame,reply)->{
   if(!mainFrame||!ORIGIN.equals(origin.toString()))return;final String raw=message.getData();if(raw==null||raw.length()>8*1024*1024)return;
   workers.execute(()->{JSONObject result=new JSONObject();try{JSONObject request=new JSONObject(raw);result.put("id",request.getInt("id"));Object value=command(request);result.put("value",value==null?JSONObject.NULL:value);}catch(Exception error){try{String type=error instanceof java.net.SocketTimeoutException?"timeout":error instanceof java.net.UnknownHostException?"dns":error instanceof javax.net.ssl.SSLException?"tls":error.getMessage()!=null&&error.getMessage().matches("HTTP \\d{3}")?"http":"native";result.put("errorCategory",type);result.put("error",type.equals("http")?error.getMessage():type.equals("tls")?"来源 TLS 连接失败":type.equals("dns")?"来源 DNS 不可用":type.equals("timeout")?"来源连接超时":"本机请求失败，请稍后重试");}catch(Exception ignored){}}runOnUiThread(()->reply.postMessage(result.toString()));});
  });web.loadUrl(HOME);
 }
 private void prepareConfig()throws Exception{
  for(String name:new String[]{"sources.json","cloud.json","metadata-catalogue.json"}){File file=new File(getFilesDir(),name);if(!file.exists())try(InputStream in=getAssets().open("private/"+name)){Files.copy(in,file.toPath());}catch(FileNotFoundException ignored){}}
  for(String name:new String[]{"sources.json","cloud.json"}){File file=new File(getFilesDir(),name);String existing=readFile(name,"").trim();if(!file.exists()||existing.equals(name.equals("sources.json")?"[]":"{}"))try(InputStream in=getAssets().open("defaults/"+name)){Files.copy(in,file.toPath(),StandardCopyOption.REPLACE_EXISTING);}catch(FileNotFoundException ignored){}}
  JSONArray sources=new JSONArray(readFile("sources.json","[]"));if(sources.length()>20)throw new IOException("Too many sources");
  for(int n=0;n<sources.length();n++){JSONObject source=sources.getJSONObject(n);URI uri=new URI(source.getString("api"));if(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||uri.getHost()==null)throw new IOException("Invalid source origin");}
  config=new JSONObject().put("sources",sources).put("cloud",new JSONObject(readFile("cloud.json","{}"))).put("metadata",new JSONObject(readFile("metadata-catalogue.json","{}"))).put("index",new JSONArray(readFile("catalogue-index.json","[]")));posterCache.films(config.getJSONArray("index"));JSONArray metadataFilms=config.getJSONObject("metadata").optJSONArray("films");if(metadataFilms!=null)posterCache.films(metadataFilms);
 }
 private String readFile(String name,String fallback)throws Exception{File f=new File(getFilesDir(),name);return f.exists()?new String(Files.readAllBytes(f.toPath()),StandardCharsets.UTF_8):fallback;}
 private Object command(JSONObject request)throws Exception{
  switch(request.getString("command")){
   case "config":return config;
   case "http":{URI uri=new URI(request.getString("url"));boolean allowed=false;JSONArray sources=config.getJSONArray("sources");for(int i=0;i<sources.length();i++){URI api=new URI(sources.getJSONObject(i).getString("api"));if(api.getScheme().equals(uri.getScheme())&&api.getHost().equalsIgnoreCase(uri.getHost())&&port(api)==port(uri)&&resourcePath(api).equals(resourcePath(uri)))allowed=true;}if(!allowed)throw new IOException("Origin denied");String body=readPublic(uri,2*1024*1024);posterCache.response(body);return body;}
   case "cache-write":{String data=request.getString("data");if(data.length()>8*1024*1024)throw new IOException("Cache too large");JSONArray parsed=new JSONArray(data);posterCache.films(parsed);if(parsed.length()>5000)throw new IOException("Too many records");File tmp=new File(getFilesDir(),"catalogue-index.tmp");Files.write(tmp.toPath(),data.getBytes(StandardCharsets.UTF_8));Files.move(tmp.toPath(),new File(getFilesDir(),"catalogue-index.json").toPath(),StandardCopyOption.REPLACE_EXISTING);return true;}
   case "screen":{boolean playing=request.optBoolean("playing");runOnUiThread(()->{if(playing)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);});return true;}
   case "update":return update(request.getString("action"));
   default:throw new IOException("Command denied");
  }
 }
 private int port(URI uri){return uri.getPort()<0?443:uri.getPort();}
 private String resourcePath(URI uri){String p=uri.getRawPath();return p==null||p.isEmpty()?"/":p;}
 private String readPublic(URI uri,int limit)throws Exception{
  if(!"https".equals(uri.getScheme())||uri.getUserInfo()!=null||uri.getHost()==null)throw new IOException("HTTPS required");
  for(InetAddress address:InetAddress.getAllByName(uri.getHost()))if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())throw new IOException("Private address denied");
  HttpURLConnection connection=(HttpURLConnection)uri.toURL().openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
  try{int status=connection.getResponseCode();if(status!=200)throw new IOException("HTTP "+status);try(InputStream in=connection.getInputStream()){return new String(readBounded(in,limit),StandardCharsets.UTF_8);}}finally{connection.disconnect();}
 }
 private byte[] readBounded(InputStream in,int limit)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("Response too large");out.write(buffer,0,n);}return out.toByteArray();}
 private synchronized JSONObject update(String action)throws Exception{
  if("state".equals(action))return updateState;
  if("check".equals(action)){try{JSONObject release=new JSONObject(readPublic(new URI("https://api.github.com/repos/lezebomb/streamdesk/releases/latest"),1024*1024));if(release.optBoolean("draft")||release.optBoolean("prerelease"))throw new IOException("Unpublished release");String tag=release.getString("tag_name");if(!tag.matches("v\\d+\\.\\d+\\.\\d+"))throw new IOException("Invalid tag");String[] v=tag.substring(1).split("\\.");long code=Long.parseLong(v[0])*1000000+Long.parseLong(v[1])*1000+Long.parseLong(v[2]);if(code<=BuildConfig.VERSION_CODE)return status("current","当前已是最新安装版本");JSONArray list=release.getJSONArray("assets");for(int i=0;i<list.length();i++){JSONObject a=list.getJSONObject(i);if(a.getString("name").equals("StreamDesk-Android-"+tag.substring(1)+".apk")&&a.optString("digest").matches("sha256:[a-f0-9]{64}")){updateAsset=a;updateState=status("available","有新的 Android 安装版本").put("latest",tag.substring(1));return updateState;}}return status("unavailable","此版本尚无已校验的 Android 安装包");}catch(Exception error){return status("unavailable","暂时未获取到新的安装版本，当前版本可继续使用");}}
  if("download".equals(action)&&updateAsset!=null){try{
   File dir=new File(getCacheDir(),"updates");dir.mkdirs();File temp=new File(dir,"download.tmp");URI uri=new URI(updateAsset.getString("browser_download_url"));if(!uri.toString().startsWith("https://github.com/lezebomb/streamdesk/releases/download/"))throw new IOException("Download denied");
   HttpURLConnection connection=null;for(int i=0;i<6;i++){String host=uri.getHost();if(!"https".equals(uri.getScheme())||!(host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")))throw new IOException("Redirect denied");connection=(HttpURLConnection)uri.toURL().openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(15000);int result=connection.getResponseCode();if(result>=300&&result<400){uri=uri.resolve(connection.getHeaderField("Location"));connection.disconnect();continue;}if(result!=200)throw new IOException("Download failed");break;}
   if(connection==null||connection.getResponseCode()!=200)throw new IOException("Download failed");MessageDigest digest=MessageDigest.getInstance("SHA-256");long bytes=0;try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(temp)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){bytes+=n;if(bytes>150*1024*1024)throw new IOException("APK too large");digest.update(buffer,0,n);out.write(buffer,0,n);}}finally{connection.disconnect();}
   if(bytes!=updateAsset.getLong("size")||!hex(digest.digest()).equals(updateAsset.getString("digest").substring(7)))throw new IOException("Hash mismatch");
   int flags=PackageManager.GET_SIGNING_CERTIFICATES;PackageInfo apk=getPackageManager().getPackageArchiveInfo(temp.getAbsolutePath(),flags),installed=getPackageManager().getPackageInfo(getPackageName(),flags);
   if(apk==null||!getPackageName().equals(apk.packageName)||apk.getLongVersionCode()<=installed.getLongVersionCode()||!Arrays.equals(apk.signingInfo.getApkContentsSigners()[0].toByteArray(),installed.signingInfo.getApkContentsSigners()[0].toByteArray()))throw new IOException("Package/signature mismatch");
   verifiedApk=new File(dir,"update.apk");Files.move(temp.toPath(),verifiedApk.toPath(),StandardCopyOption.REPLACE_EXISTING);return status("ready","校验完成，点击安装覆盖更新");
  }catch(Exception error){verifiedApk=null;return status("available","下载或校验失败，已安装版本和记录保留");}}
  if("install".equals(action)&&verifiedApk!=null){runOnUiThread(()->{if(!getPackageManager().canRequestPackageInstalls()){startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())));return;}Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",verifiedApk);startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));});return updateState;}
  throw new IOException("Update action denied");
 }
 private JSONObject status(String state,String message)throws Exception{return updateState=new JSONObject().put("state",state).put("version",BuildConfig.VERSION_NAME).put("message",message);}
 private String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b));return s.toString();}
 @Override public void onBackPressed(){if(fullScreen!=null){web.getWebChromeClient().onHideCustomView();return;}web.evaluateJavascript("if(!document.querySelector('#watch').hidden)document.querySelector('#close-watch').click();else if(!document.querySelector('#discover-view').hidden){}else document.querySelector('.bottom-nav [data-view=discover]').click()",null);}
 @Override protected void onPause(){web.evaluateJavascript("window.streamdesk?.player.video.pause()",null);getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onPause();}
 @Override protected void onDestroy(){workers.shutdownNow();posterCache.close();web.destroy();super.onDestroy();}
}
