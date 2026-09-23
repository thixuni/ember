/* The app icon, drawn rather than kept as artwork: the same spark as the
   sidebar mark, white on Ember orange, written to build/icon.png (512px)
   and build/icon.ico (256px). Run it with "npm run icon" after changing
   the mark in src/index.html, and keep the two the same. */
const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'build');

const PAGE_BODY = `<!doctype html><meta charset="utf-8"><script>
function draw(size){
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
  x.fillStyle='#E8622A';x.beginPath();x.roundRect(0,0,size,size,size*0.225);x.fill();
  const s=size/24*0.60,o=(size-24*s)/2;
  x.save();x.translate(o,o);x.scale(s,s);x.fillStyle='#FFFFFF';
  x.fill(new Path2D("M17.6 13.8V4.3Q17.6 3.2 16.63 3.71L8.22 8.14A6.4 6.4 0 1 0 17.6 13.8ZM11.2 10.85a2.95 2.95 0 1 1 0 5.9 2.95 2.95 0 0 1 0-5.9z"),'evenodd');
  const d=new Path2D();d.arc(6,4.2,1.6,0,Math.PI*2);x.fill(d);
  x.restore();return c.toDataURL('image/png').split(',')[1];
}
</script>`;

/* An .ico holding one PNG: the 6-byte header, one 16-byte entry, the image. */
function ico(png){
  const head=Buffer.alloc(6);head.writeUInt16LE(0,0);head.writeUInt16LE(1,2);head.writeUInt16LE(1,4);
  const e=Buffer.alloc(16);
  e[0]=0;e[1]=0;e[2]=0;e[3]=0;                       // 256x256 is written as 0
  e.writeUInt16LE(1,4);e.writeUInt16LE(32,6);
  e.writeUInt32LE(png.length,8);e.writeUInt32LE(22,12);
  return Buffer.concat([head,e,png]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({show:false, width:600, height:600, webPreferences:{offscreen:true}});
  const tmp=path.join(require("os").tmpdir(),"ember-icon.html");fs.writeFileSync(tmp,PAGE_BODY);await w.loadFile(tmp);
  const b512 = await w.webContents.executeJavaScript('draw(512)');
  const b256 = await w.webContents.executeJavaScript('draw(256)');
  fs.writeFileSync(path.join(OUT,'icon.png'), Buffer.from(b512,'base64'));
  fs.writeFileSync(path.join(OUT,'icon.ico'), ico(Buffer.from(b256,'base64')));
  console.log('wrote icon.png', Buffer.from(b512,'base64').length, 'icon.ico', Buffer.from(b256,'base64').length+22);
  app.quit();
});
