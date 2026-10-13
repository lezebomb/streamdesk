package com.lezebomb.streamdesk;

import android.graphics.Bitmap;import android.graphics.BitmapFactory;import android.util.Log;import android.webkit.WebResourceResponse;
import org.json.*;import java.io.*;import java.net.*;import java.nio.file.*;import java.security.MessageDigest;import java.util.*;import java.util.concurrent.*;

/** Cache only image addresses already supplied by configured catalogues. */
final class PosterCache {
 private final File directory;
 private final Set<String> known=ConcurrentHashMap.newKeySet();
 private final Map<String,CompletableFuture<byte[]>> pending=new ConcurrentHashMap<>();
 private final Map<String,Long> failed=new ConcurrentHashMap<>();
 private final ExecutorService workers=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(16));
 PosterCache(File cache){directory=new File(cache,"posters-v1");directory.mkdirs();}
 void films(JSONArray films){for(int i=0;i<films.length();i++){JSONObject f=films.optJSONObject(i);if(f==null)continue;remember(f.optString("poster"));remember(f.optString("vod_pic"));JSONArray alternatives=f.optJSONArray("posterAlternatives");if(alternatives!=null)for(int n=0;n<alternatives.length();n++)remember(alternatives.optString(n));}}
 void response(String body){try{JSONObject data=new JSONObject(body);JSONArray list=data.optJSONArray("list");if(list!=null)films(list);}catch(JSONException ignored){}}
 private void remember(String address){try{URI uri=new URI(address);if("https".equals(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null){if(known.size()>20000)known.clear();known.add(uri.toASCIIString());}}catch(Exception ignored){}}
 WebResourceResponse intercept(String address){if(!known.contains(address))return null;
  CompletableFuture<byte[]> job;
  try{job=pending.computeIfAbsent(address,key->CompletableFuture.supplyAsync(()->{try{return read(key);}catch(Exception error){failed.put(key,System.currentTimeMillis());throw new CompletionException(error);}},workers));}catch(RejectedExecutionException error){return null;}
  job.whenComplete((value,error)->pending.remove(address,job));
  // Return immediately: poster downloads have their own pool, separate from API workers.
  InputStream stream=new InputStream(){InputStream loaded;private InputStream input()throws IOException{if(loaded==null)try{loaded=new ByteArrayInputStream(job.get(9,TimeUnit.SECONDS));}catch(Exception error){throw new IOException("Poster unavailable");}return loaded;}public int read()throws IOException{return input().read();}public int read(byte[] b,int offset,int length)throws IOException{return input().read(b,offset,length);}public void close()throws IOException{if(loaded!=null)loaded.close();}};
  return new WebResourceResponse("image/jpeg",null,200,"OK",Collections.singletonMap("Cache-Control","private, max-age=86400"),stream);
 }
 private byte[] read(String address)throws Exception{long start=System.nanoTime();StringBuilder key=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(address.getBytes(java.nio.charset.StandardCharsets.UTF_8)))key.append(String.format(Locale.ROOT,"%02x",b));File file=new File(directory,key+".jpg");
  if(file.isFile()&&System.currentTimeMillis()-file.lastModified()<7L*86400000){byte[] bytes=Files.readAllBytes(file.toPath());Log.i("StreamDeskPoster","cache=hit bytes="+bytes.length+" ms="+(System.nanoTime()-start)/1000000);return bytes;}
  if(System.currentTimeMillis()-failed.getOrDefault(address,0L)<60000)throw new IOException("Poster cooldown");URI uri=new URI(address);byte[] original=null;
  for(int hop=0;hop<3;hop++){if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getPort()>0&&uri.getPort()!=443)throw new IOException("Poster address denied");for(InetAddress ip:InetAddress.getAllByName(uri.getHost()))if(!publicAddress(ip))throw new IOException("Poster private address denied");HttpURLConnection connection=(HttpURLConnection)uri.toURL().openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
   try{int status=connection.getResponseCode();if(status>=300&&status<400){uri=uri.resolve(connection.getHeaderField("Location"));continue;}if(status!=200||connection.getContentType()==null||!connection.getContentType().toLowerCase(Locale.ROOT).startsWith("image/"))throw new IOException("Poster HTTP failure");try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){byte[] buffer=new byte[16384];int n;while((n=input.read(buffer))!=-1){if(System.nanoTime()-start>7000000000L)throw new IOException("Poster total timeout");if(output.size()+n>3*1024*1024)throw new IOException("Poster too large");output.write(buffer,0,n);}original=output.toByteArray();}break;}finally{connection.disconnect();}}
  if(original==null)throw new IOException("Poster redirect limit");BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(original,0,original.length,options);if(options.outWidth<=0||options.outHeight<=0)throw new IOException("Unsupported poster format");options.inJustDecodeBounds=false;options.inSampleSize=1;while(options.outWidth/options.inSampleSize>1080||options.outHeight/options.inSampleSize>1620)options.inSampleSize*=2;
  Bitmap bitmap=BitmapFactory.decodeByteArray(original,0,original.length,options);if(bitmap==null)throw new IOException("Poster decode failed");byte[] bytes;
  try{float scale=Math.min(1f,Math.min(540f/bitmap.getWidth(),810f/bitmap.getHeight()));if(scale<1){Bitmap reduced=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);bitmap.recycle();bitmap=reduced;}ByteArrayOutputStream output=new ByteArrayOutputStream();if(!bitmap.compress(Bitmap.CompressFormat.JPEG,85,output))throw new IOException("Poster encode failed");bytes=output.toByteArray();}finally{bitmap.recycle();}
  File temp=File.createTempFile("poster-",".tmp",directory);try{Files.write(temp.toPath(),bytes);Files.move(temp.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING);}finally{temp.delete();}trim();failed.remove(address);Log.i("StreamDeskPoster","cache=miss bytes="+bytes.length+" ms="+(System.nanoTime()-start)/1000000);return bytes;
 }
 private synchronized void trim(){File[] files=directory.listFiles((dir,name)->name.endsWith(".jpg"));if(files==null)return;Arrays.sort(files,Comparator.comparingLong(File::lastModified));long total=0;for(File file:files)total+=file.length();for(File file:files){if(total<=32*1024*1024)break;long bytes=file.length();if(file.delete())total-=bytes;}}
 private boolean publicAddress(InetAddress address){if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())return false;byte[] b=address.getAddress();if(b.length==16)return (b[0]&0xe0)==0x20&&!((b[0]&255)==0x20&&(b[1]&255)==1&&(b[2]&255)==0x0d&&(b[3]&255)==0xb8);int a=b[0]&255,c=b[1]&255;return a!=0&&a<224&&!(a==100&&c>=64&&c<=127)&&!(a==198&&(c==18||c==19));}
 void close(){workers.shutdownNow();}
}
