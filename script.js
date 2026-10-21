(() => {
 const $=id=>document.getElementById(id), state=[];
 const drop=$('drop'), picker=$('picker'), folderPicker=$('folderPicker');
 let strategyValue='balanced';
 const strategyButtons=[$('balanced'),$('dimensions')];
 function updateStrategy(value=strategyValue){
   strategyValue=value;
   strategyButtons.forEach((button,index)=>{
     const selected=(index===0&&value==='balanced')||(index===1&&value==='dimensions');
     button.classList.toggle('selected',selected);
     button.setAttribute('aria-pressed',String(selected));
   });
 }
 strategyButtons[0].addEventListener('click',()=>updateStrategy('balanced'));
 strategyButtons[1].addEventListener('click',()=>updateStrategy('dimensions'));
 $('chooseFiles').addEventListener('click',()=>picker.click());
 $('chooseFolder').addEventListener('click',()=>folderPicker.click());
 picker.addEventListener('change',e=>{addFiles([...e.target.files]);picker.value=''});
 folderPicker.addEventListener('change',e=>{addFiles([...e.target.files]);folderPicker.value=''});
 drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});
 drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');addFiles([...e.dataTransfer.files])});
 $('process').addEventListener('click',processAll);
 $('clear').addEventListener('click',clearAll);
 $('zip').addEventListener('click',downloadZip);
 function clearAll(){state.forEach(x=>{if(x.blobUrl)URL.revokeObjectURL(x.blobUrl)});state.splice(0);render();$('overall').style.width='0';$('summary').textContent='Nessuna immagine selezionata.'}
 function addFiles(files){
   const accepted=files.filter(f=>/\.(jpe?g|png|webp|bmp)$/i.test(f.name)||['image/jpeg','image/png','image/webp','image/bmp'].includes(f.type));
   let added=0;
   for(const file of accepted){if(state.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;state.push({file,status:'In attesa',blob:null,blobUrl:null,outputName:'',outputType:'',quality:null,dimensions:null});added++}
   render();
   if(files.length&&!accepted.length)$('summary').textContent='Nessun formato supportato. Seleziona JPEG, PNG, WebP o BMP.';
   else if(accepted.length&&!added)$('summary').textContent='Queste immagini sono già nell’elenco.';
 }
 function fmt(bytes){return bytes<1024?bytes+' B':(bytes/1024).toFixed(1)+' KB'}
 function render(){
   $('process').disabled=!state.length;$('clear').disabled=!state.length;
   if(!$('process').disabled&&state.some(x=>x.status==='In elaborazione'))$('process').disabled=true;
   $('summary').textContent=state.length?state.length+' '+(state.length===1?'immagine selezionata':'immagini selezionate')+'.':'Nessuna immagine selezionata.';
   const list=$('results');list.replaceChildren();
   state.forEach(item=>{
     const row=document.createElement('div');row.className='file';
     const left=document.createElement('div'),name=document.createElement('div');name.className='filename';name.textContent=item.outputName||item.file.webkitRelativePath||item.file.name;
     const meta=document.createElement('div');meta.className='meta';meta.textContent=item.blob?fmt(item.file.size)+' → '+fmt(item.blob.size)+(item.dimensions?' · '+item.dimensions:''):(fmt(item.file.size)+' · Originale');
     left.append(name,meta);const right=document.createElement('div');right.className='status'+(item.blob?' good':'');right.textContent=item.status;
     if(item.blob){const a=document.createElement('a');a.className='download';a.href=item.blobUrl;a.download=item.outputName;a.textContent='Scarica';right.append(document.createElement('br'),a)}
     row.append(left,right);list.append(row);
   });
   $('resultsPanel').classList.toggle('hidden',!state.length);$('zip').disabled=!state.some(x=>x.blob);
 }
 function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Formato non leggibile dal browser'))};img.src=url})}
 function encode(img,width,height,type,quality){
   return new Promise((resolve,reject)=>{
     const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
     const ctx=canvas.getContext('2d',{alpha:type!=='image/jpeg'});
     if(!ctx){reject(new Error('Canvas non disponibile'));return}
     if(type==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)}
     ctx.drawImage(img,0,0,width,height);
     canvas.toBlob(blob=>{canvas.width=canvas.height=0;if(!blob)reject(new Error('Compressione non riuscita'));else resolve(blob)},type,quality);
   });
 }
 async function compressImage(item,maxBytes,strategy){
   if(item.file.size<=maxBytes){
     item.blob=item.file;item.blobUrl=URL.createObjectURL(item.file);item.outputName=item.file.name;
     item.dimensions='Originale mantenuto';item.quality=null;item.status='Già entro il limite';return;
   }
   const img=await loadImage(item.file);
   const sourceType=(item.file.type||'').toLowerCase();
   let type=sourceType;
   if(type==='image/bmp'||!['image/jpeg','image/png','image/webp'].includes(type)){
     const ext=item.file.name.split('.').pop().toLowerCase();
     if(ext==='bmp')type='image/png';
     else throw new Error('Formato non supportato dal browser');
   }
   const extension=type==='image/jpeg'?'jpg':type==='image/webp'?'webp':'png';
   let width=img.naturalWidth,height=img.naturalHeight,blob=null,usedQuality=null;
   if(strategy==='balanced'&&(type==='image/jpeg'||type==='image/webp')){
     for(let q=90;q>=10;q-=5){
       const candidate=await encode(img,width,height,type,q/100);
       if(candidate.size<=maxBytes){blob=candidate;usedQuality=q;break}
     }
   }
   if(!blob){
     let scale=1;
     for(let attempt=0;attempt<35;attempt++){
       const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
       const q=(type==='image/jpeg'||type==='image/webp')?0.85:undefined;
       const candidate=await encode(img,w,h,type,q);
       if(candidate.size<=maxBytes){blob=candidate;width=w;height=h;usedQuality=q===undefined?null:Math.round(q*100);break}
       scale*=0.85;
     }
   }
   if(!blob)throw new Error('Non è stato possibile raggiungere il limite impostato');
   const base=item.file.name.replace(/\\.[^.]+$/,'');
   item.blob=blob;item.outputType=type;item.outputName=base+(type==='image/png'&&/\\.bmp$/i.test(item.file.name)?'.png':'.'+extension);
   item.blobUrl=URL.createObjectURL(blob);item.quality=usedQuality;item.dimensions=width+' × '+height+' px';
   item.status=blob.size<=maxBytes?'Completata':'Limite superato';
 }
 async function processAll(){
   const kb=Number($('maxkb').value),strategy=strategyValue;
   if(!Number.isFinite(kb)||kb<50||kb>10000){$('summary').textContent='Inserisci un limite tra 50 e 10.000 KB.';return}
   $('process').disabled=true;$('zip').disabled=true;
   state.forEach(x=>{if(x.blobUrl)URL.revokeObjectURL(x.blobUrl);x.blobUrl=null;x.blob=null;x.status='In elaborazione';x.outputName=''});
   render();let done=0,errors=0;
   for(const item of state){
     try{await compressImage(item,kb*1024,strategy)}catch(e){item.status='Errore';item.error=e.message;errors++}
     done++;$('overall').style.width=(done/state.length*100)+'%';render();
   }
   $('process').disabled=false;
   const successes=state.filter(x=>x.blob).length;
   $('summary').textContent='Completate '+successes+' di '+done+(errors?' · Errori '+errors:'')+'.';
 }
 async function downloadZip(){
   const files=state.filter(x=>x.blob);if(!files.length)return;
   $('zip').disabled=true;$('zipstatus').textContent='Preparo lo ZIP…';
   try{
     if(!window.JSZip)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});
     const zip=new JSZip(),used=new Set();
     files.forEach(x=>{
       let name=x.outputName,n=1;
       while(used.has(name.toLowerCase())){const dot=x.outputName.lastIndexOf('.');name=x.outputName.slice(0,dot)+'_'+(n++)+x.outputName.slice(dot)}
       used.add(name.toLowerCase());zip.file(name,x.blob);
     });
     const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=url;a.download='immagini-ridimensionate.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);$('zipstatus').textContent='';
   }catch(e){$('zipstatus').textContent='ZIP non disponibile: scarica i file singolarmente.'}
   finally{$('zip').disabled=!state.some(x=>x.blob)}
 }
 render();
})();
