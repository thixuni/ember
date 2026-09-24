/* The app icon, drawn rather than kept as artwork: the same flame as the
   sidebar mark, white on Ember orange, written to build/icon.png (512px)
   and build/icon.ico (256px). Run it with "npm run icon" after changing
   the mark in src/index.html, and keep the two the same -- the paths and
   the transform below are copied straight out of the i-ember symbol. */
const {app, BrowserWindow} = require('electron');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'build');

const PAGE_BODY = `<!doctype html><meta charset="utf-8"><script>
function draw(size){
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
  x.fillStyle='#E8622A';x.beginPath();x.roundRect(0,0,size,size,size*0.225);x.fill();
  const s=size/24*0.66,o=(size-24*s)/2;
  x.save();x.translate(o,o);x.scale(s,s);
  x.translate(2.56,0.55);x.scale(0.473,0.473);          // the symbol's own <g transform>
  x.fillStyle='#FFFFFF';
  const p=new Path2D("M20 2c6.4 12 14 18.6 14 30.4A14 14 0 0 1 6 32.4C6 25 10.4 20.4 13.6 13.6c1.4 5 3.6 8.4 6 10.6C21.2 17 21 8.6 20 2Z");
  p.addPath(new Path2D("M20 31c2.8 4.7 4.5 6.8 4.5 10a4.5 4.5 0 0 1-9 0c0-2.8 2.2-5.8 4.5-10Z"));
  x.fill(p,'evenodd');
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
