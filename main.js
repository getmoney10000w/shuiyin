// 主逻辑脚本
let files = [];
let fileMap = {}; // 保持目录结构
let previewImg = null;
let dragOffset = {x:0, y:0};
let dragging = false;
let currentIndex = 0; // 当前预览索引
let mode = 'global'; // 'global' or 'single'

// 水印交互相关状态
let watermarkSelected = false; // 水印是否被选中
let activeHandle = null; // 当前激活的手柄：null, 'move', 'rotate', 'scale'
let startAngle = 0; // 旋转起始角度
let startDistance = 0; // 缩放起始距离
// 初始化水印参数，确保首次切换字体立即生效
const wmParams = {
  text: document.getElementById('wm-text').value,
  font: document.getElementById('wm-font').value,
  size: parseInt(document.getElementById('wm-size').value, 10) || 100,
  color: document.getElementById('wm-color').value,
  opacity: parseFloat(document.getElementById('wm-opacity').value),
  rotate: parseInt(document.getElementById('wm-rotate').value, 10),
  x: 0.5, // 百分比
  y: 0.5
};
// 单独图片水印参数映射
let perImageParams = {}; // { [relPath]: { x, y, size, rotate } }

// 单独图片水印参数映射

// 获取当前图片的水印参数对象
function getCurrentParams() {
  if (mode === 'single' && files.length > 0) {
    let key = files[currentIndex].webkitRelativePath;
    if (!perImageParams[key]) {
      // 初始化为全局参数快照
      perImageParams[key] = {
        x: wmParams.x,
        y: wmParams.y,
        size: wmParams.size,
        rotate: wmParams.rotate
      };
    }
    return perImageParams[key];
  }
  return wmParams;
}

// 设置当前图片的水印参数
function setCurrentParams(params) {
  if (mode === 'single' && files.length > 0) {
    let key = files[currentIndex].webkitRelativePath;
    perImageParams[key] = Object.assign({}, perImageParams[key] || {}, params);
  } else {
    Object.assign(wmParams, params);
    // 不再清空perImageParams，保证单独调整不丢失
  }
}

// 应用当前全局参数到所有图片（如有需要可调用）
function applyGlobalParamsToAll() {
  for (let relPath in fileMap) {
    perImageParams[relPath] = {
      x: wmParams.x,
      y: wmParams.y,
      size: wmParams.size,
      rotate: wmParams.rotate
    };
  }
}

const fileInput = document.getElementById('file-input');
const filePickInput = document.getElementById('file-pick-input');
const fileListDiv = document.getElementById('file-list');
const previewCanvas = document.getElementById('preview-canvas');
const ctx = previewCanvas.getContext('2d');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const previewIndexSpan = document.getElementById('preview-index');
const modeRadios = document.getElementsByName('wm-mode');

fileInput.addEventListener('change', handleFileSelect);
filePickInput.addEventListener('change', handleFileSelect);

modeRadios.forEach(radio => {
  radio.addEventListener('change', function() {
    if (this.checked) {
      mode = this.value;
      // 切换模式时，重新刷新当前图片参数到滑块和预览
      updateSlidersFromCurrent();
      drawPreview();
    }
  });
});

function handleFileSelect(e) {
  files = [];
  fileMap = {};
  fileListDiv.innerHTML = '';
  const fileArr = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
  files = fileArr;
  // 判断来源
  const isFolder = e.target === fileInput;
  fileArr.forEach(f => {
    // 文件夹上传用 webkitRelativePath，单独图片上传用 name
    const key = isFolder && f.webkitRelativePath ? f.webkitRelativePath : f.name;
    fileMap[key] = f;
    const div = document.createElement('div');
    div.textContent = key;
    fileListDiv.appendChild(div);
  });
  currentIndex = 0;
  // 重置完成
  updatePreviewControls();
  if (files.length > 0) loadPreview(files[0]);
}

function loadPreview(file) {
  const reader = new FileReader();
  reader.onload = function(ev) {
    previewImg = new window.Image();
    previewImg.onload = () => {
      drawPreview();
      updateSlidersFromCurrent();
    };
    previewImg.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function drawPreview() {
  if (!previewImg) return;
  let w = previewImg.naturalWidth;
  let h = previewImg.naturalHeight;
  let maxW = document.getElementById('preview-section').offsetWidth - 40; // 动态获取容器宽度，留padding
  let maxH = 600; // 或更大
  let scale = Math.min(maxW/w, maxH/h, 1);
  let drawW = w * scale;
  let drawH = h * scale;
  previewCanvas.width = drawW;
  previewCanvas.height = drawH;
  previewCanvas.style.width = drawW + 'px';
  previewCanvas.style.height = drawH + 'px';
  ctx.clearRect(0,0,drawW,drawH);
  ctx.drawImage(previewImg, 0, 0, drawW, drawH);
  // 获取当前水印参数
  let params = getCurrentParams();
  let previewFontSize = params.size * scale;
  drawWatermark(drawW, drawH, params.x, params.y, previewFontSize, params.rotate);
}

function drawWatermark(cw, ch, xRatio, yRatio, fontSizeOverride, rotateOverride) {
  let params = getCurrentParams();
  let fontSize = fontSizeOverride !== undefined ? fontSizeOverride : params.size;
  let opacity = parseFloat(document.getElementById('wm-opacity').value);
  if (opacity <= 0) return; // 透明度为0时不绘制水印
  
  // 计算水印尺寸和位置信息
  const lines = wmParams.text.split(/\r?\n/);
  let maxWidth = 0;
  ctx.save();
  ctx.font = `${fontSize}px ${wmParams.font}`;
  lines.forEach(line => {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  });
  ctx.restore();
  
  let totalHeight = lines.length * fontSize;
  let x = cw * xRatio - maxWidth/2;
  let y = ch * yRatio - totalHeight/2;
  
  // 保存水印的边界框信息，用于后续判断点击和绘制手柄
  const wmBox = {
    centerX: cw * xRatio,
    centerY: ch * yRatio,
    width: maxWidth,
    height: totalHeight,
    angle: (rotateOverride !== undefined ? rotateOverride : params.rotate) * Math.PI / 180
  };
  
  // 绘制水印文本
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `${fontSize}px ${wmParams.font}`;
  ctx.fillStyle = wmParams.color;
  ctx.textBaseline = 'top';
  ctx.translate(x + maxWidth/2, y + totalHeight/2);
  ctx.rotate((rotateOverride !== undefined ? rotateOverride : params.rotate) * Math.PI / 180);
  
  // 如果水印被选中，先绘制半透明背景
  if (watermarkSelected) {
    ctx.fillStyle = 'rgba(79, 140, 255, 0.1)';
    ctx.fillRect(-maxWidth/2 - 10, -totalHeight/2 - 10, maxWidth + 20, totalHeight + 20);
    ctx.strokeStyle = 'rgba(79, 140, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-maxWidth/2 - 10, -totalHeight/2 - 10, maxWidth + 20, totalHeight + 20);
  }
  
  // 逐行绘制文本
  ctx.fillStyle = wmParams.color;
  lines.forEach((line, i) => {
    ctx.fillText(line, -maxWidth/2, -totalHeight/2 + i * fontSize);
  });
  ctx.restore();
  
  // 如果水印被选中，绘制操作手柄
  if (watermarkSelected) {
    drawWatermarkHandles(wmBox, maxWidth, totalHeight);
  }
}

function getCurrentXY() {
  let params = getCurrentParams();
  return {x: params.x, y: params.y};
}

function setCurrentXY(x, y) {
  setCurrentParams({x, y});
}

function updateSlidersFromCurrent() {
  let pos = getCurrentXY();
  document.getElementById('wm-x').value = Math.round(pos.x*100);
  document.getElementById('wm-y').value = Math.round(pos.y*100);
}

// 参数变更事件
['wm-text','wm-size','wm-color','wm-opacity','wm-rotate'].forEach(id=>{
  document.getElementById(id).addEventListener('input', (e)=>{
    if(id==='wm-text') wmParams.text = e.target.value.replace(/\r?\n/g, '\n');
    if(id==='wm-size') wmParams.size = parseInt(e.target.value)||100;
    if(id==='wm-color') wmParams.color = e.target.value;
    if(id==='wm-opacity') wmParams.opacity = parseFloat(e.target.value)||0.5;
    if(id==='wm-rotate') wmParams.rotate = parseFloat(e.target.value)||0;
    drawPreview();
  });
});
document.getElementById('wm-font').addEventListener('change', function(e) {
  wmParams.font = e.target.value;
  drawPreview();
});
document.getElementById('wm-x').addEventListener('input', (e)=>{
  let x = parseInt(e.target.value)/100;
  let y = getCurrentXY().y;
  setCurrentXY(x, y);
  drawPreview();
});
document.getElementById('wm-y').addEventListener('input', (e)=>{
  let x = getCurrentXY().x;
  let y = parseInt(e.target.value)/100;
  setCurrentXY(x, y);
  drawPreview();
});

document.getElementById('wm-size').addEventListener('input', function(e) {
  document.getElementById('val-size').textContent = e.target.value + 'px';
  wmParams.size = parseInt(e.target.value, 10);
  drawPreview();
});
document.getElementById('wm-rotate').addEventListener('input', function(e) {
  document.getElementById('val-rotate').textContent = e.target.value + '°';
  wmParams.rotate = parseInt(e.target.value, 10);
  drawPreview();
});

// 水印设置区数值同步
function updateSettingValues() {
  let params = getCurrentParams();
  document.getElementById('val-size').textContent = params.size + 'px';
  document.getElementById('val-color').textContent = document.getElementById('wm-color').value;
  document.getElementById('val-opacity').textContent = document.getElementById('wm-opacity').value;
  document.getElementById('val-rotate').textContent = params.rotate + '°';
  document.getElementById('val-x').textContent = Math.round(params.x*100) + '%';
  document.getElementById('val-y').textContent = Math.round(params.y*100) + '%';
}

['wm-size','wm-color','wm-opacity','wm-rotate','wm-x','wm-y'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => {
    let params = getCurrentParams();
    if(id==='wm-size') setCurrentParams({size: parseInt(e.target.value)||100});
    if(id==='wm-rotate') setCurrentParams({rotate: parseInt(e.target.value)||0});
    if(id==='wm-x') setCurrentParams({x: parseInt(e.target.value)/100});
    if(id==='wm-y') setCurrentParams({y: parseInt(e.target.value)/100});
    updateSettingValues();
    drawPreview();
  });
});
updateSettingValues();

// 拖拽水印
let lastPos = null;
previewCanvas.addEventListener('mousedown', function(e){
  if (!previewImg) return;
  let mouse = getMousePos(e);
  
  // 检查是否点击在手柄上
  const handle = getHandleAtPoint(mouse.x, mouse.y);
  
  if (handle) {
    // 点击在手柄上
    activeHandle = handle.type;
    lastPos = mouse;
    dragging = true;
    
    // 如果是旋转手柄，记录起始角度
    if (activeHandle === 'rotate') {
      const pos = getCurrentXY();
      const centerX = previewCanvas.width * pos.x;
      const centerY = previewCanvas.height * pos.y;
      startAngle = Math.atan2(mouse.y - centerY, mouse.x - centerX);
    }
    // 如果是缩放手柄，记录起始距离
    else if (activeHandle === 'scale') {
      const pos = getCurrentXY();
      const centerX = previewCanvas.width * pos.x;
      const centerY = previewCanvas.height * pos.y;
      const dx = mouse.x - centerX;
      const dy = mouse.y - centerY;
      startDistance = Math.sqrt(dx*dx + dy*dy);
    }
  } 
  else if (isPointInWatermark(mouse.x, mouse.y)) {
    // 点击在水印上，选中并准备拖动
    watermarkSelected = true;
    activeHandle = 'move';
    lastPos = mouse;
    dragging = true;
  } 
  else {
    // 点击在空白处，取消选中
    watermarkSelected = false;
    activeHandle = null;
    dragging = false;
  }
  
  // 重绘显示选中状态
  drawPreview();
});
previewCanvas.addEventListener('mousemove', function(e){
  let mouse = getMousePos(e);
  
  // 鼠标指针样式处理
  if (!dragging) {
    // 检查是否在手柄上
    const handle = getHandleAtPoint(mouse.x, mouse.y);
    if (handle) {
      // 根据手柄类型设置鼠标样式
      if (handle.type === 'rotate') {
        previewCanvas.style.cursor = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'%23000\' d=\'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z\'/%3E%3C/svg%3E") 12 12, auto';
      } else if (handle.type === 'scale') {
        previewCanvas.style.cursor = 'nwse-resize';
      } else {
        previewCanvas.style.cursor = 'move';
      }
    } else if (isPointInWatermark(mouse.x, mouse.y)) {
      previewCanvas.style.cursor = 'move';
    } else {
      previewCanvas.style.cursor = 'default';
    }
    return;
  }
  
  // 拖动处理
  if (activeHandle === 'move') {
    // 移动水印
    let dx = mouse.x - lastPos.x;
    let dy = mouse.y - lastPos.y;
    let cw = previewCanvas.width, ch = previewCanvas.height;
    let cur = getCurrentXY();
    let x = cur.x + dx/cw;
    let y = cur.y + dy/ch;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    setCurrentParams({x, y});
  } 
  else if (activeHandle === 'rotate') {
    // 旋转水印
    const pos = getCurrentXY();
    const centerX = previewCanvas.width * pos.x;
    const centerY = previewCanvas.height * pos.y;
    // 计算旋转角度
    const currentAngle = Math.atan2(mouse.y - centerY, mouse.x - centerX);
    let angleDiff = (currentAngle - startAngle) * 180 / Math.PI;
    // 更新旋转角度
    let params = getCurrentParams();
    let newRotate = (params.rotate + angleDiff) % 360;
    if (newRotate < 0) newRotate += 360;
    setCurrentParams({rotate: Math.round(newRotate)});
    // 更新旋转起始角度为当前角度
    startAngle = currentAngle;
    // 更新UI滑块
    document.getElementById('wm-rotate').value = Math.round(newRotate);
    document.getElementById('val-rotate').textContent = Math.round(newRotate) + '°';
  } 
  else if (activeHandle === 'scale') {
    // 缩放水印
    const pos = getCurrentXY();
    const centerX = previewCanvas.width * pos.x;
    const centerY = previewCanvas.height * pos.y;
    // 计算当前距离
    const dx = mouse.x - centerX;
    const dy = mouse.y - centerY;
    const currentDistance = Math.sqrt(dx*dx + dy*dy);
    // 计算缩放比例
    let params = getCurrentParams();
    const scale = currentDistance / startDistance;
    // 更新字体大小
    const newSize = Math.max(10, Math.min(300, Math.round(params.size * scale)));
    setCurrentParams({size: newSize});
    startDistance = currentDistance; // 更新起始距离
    // 更新UI滑块
    document.getElementById('wm-size').value = newSize;
    document.getElementById('val-size').textContent = newSize + 'px';
  }
  
  // 更新位置
  lastPos = mouse;
  updateSlidersFromCurrent();
  drawPreview();
});
window.addEventListener('mouseup', function(){
  if (dragging) {
    // 如果是缩放或旋转操作，更新所有设置值
    if (activeHandle === 'scale' || activeHandle === 'rotate') {
      updateSettingValues();
    }
    
    // 重置拖动状态
    dragging = false;
    activeHandle = null;
  }
});
function getMousePos(e){
  let rect = previewCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// 预览翻页功能
prevBtn.addEventListener('click', function(){
  if (files.length === 0) return;
  currentIndex = (currentIndex - 1 + files.length) % files.length;
  updatePreviewControls();
  loadPreview(files[currentIndex]);
});
nextBtn.addEventListener('click', function(){
  if (files.length === 0) return;
  currentIndex = (currentIndex + 1) % files.length;
  updatePreviewControls();
  loadPreview(files[currentIndex]);
});
function updatePreviewControls(){
  let params = getCurrentParams();
  document.getElementById('wm-x').value = Math.round(params.x*100);
  document.getElementById('wm-y').value = Math.round(params.y*100);
  document.getElementById('wm-size').value = params.size;
  document.getElementById('val-size').textContent = params.size + 'px';
  document.getElementById('wm-rotate').value = params.rotate;
  document.getElementById('val-rotate').textContent = params.rotate + '°';
  previewIndexSpan.textContent = files.length > 0 ? `${currentIndex+1} / ${files.length}` : '0 / 0';
  prevBtn.disabled = files.length <= 1;
  nextBtn.disabled = files.length <= 1;
}

// 批量处理与下载
const processBtn = document.getElementById('process-btn');
processBtn.addEventListener('click', async function(){
  if (files.length === 0) return alert('请先选择图片文件夹！');
  processBtn.disabled = true;
  processBtn.textContent = '处理中...';
  const zip = new JSZip();
  for (let relPath in fileMap) {
    let file = fileMap[relPath];
    // 处理时用对应的参数
    let params;
    if (mode === 'single' && perImageParams[relPath]) {
      params = perImageParams[relPath];
    } else {
      params = wmParams;
    }
    let imgData = await processImage(file, params);
    zip.file(relPath, imgData.split(',')[1], {base64:true});
  }
  zip.generateAsync({type:'blob'}).then(blob=>{
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'watermarked_images.zip';
    a.click();
    processBtn.disabled = false;
    processBtn.textContent = '批量处理并下载';
  });
});

function processImage(file, params) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = function(ev) {
      let img = new window.Image();
      img.onload = ()=>{
        // 保持原始尺寸
        let canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        let cctx = canvas.getContext('2d');
        cctx.drawImage(img,0,0);
        cctx.save();
        cctx.globalAlpha = params.opacity !== undefined ? params.opacity : wmParams.opacity;
        cctx.font = `${params.size || wmParams.size}px ${wmParams.font}`;
        cctx.fillStyle = wmParams.color;
        cctx.textBaseline = 'top';
        // 多行文本支持
        const lines = wmParams.text.split(/\r?\n/);
        let maxWidth = 0;
        lines.forEach(line => {
          const w = cctx.measureText(line).width;
          if (w > maxWidth) maxWidth = w;
        });
        let totalHeight = lines.length * (params.size || wmParams.size);
        let x = canvas.width * (params.x || wmParams.x) - maxWidth/2;
        let y = canvas.height * (params.y || wmParams.y) - totalHeight/2;
        cctx.translate(x + maxWidth/2, y + totalHeight/2);
        cctx.rotate((params.rotate || wmParams.rotate) * Math.PI / 180);
        lines.forEach((line, i) => {
          cctx.fillText(line, -maxWidth/2, -totalHeight/2 + i * (params.size || wmParams.size));
        });
        cctx.restore();
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// 预加载字体以确保所有字体都能正确显示
function preloadFonts() {
  // 创建一个隐藏的div用于预加载字体
  const preloadDiv = document.createElement('div');
  preloadDiv.style.opacity = '0';
  preloadDiv.style.position = 'absolute';
  preloadDiv.style.pointerEvents = 'none';
  preloadDiv.style.top = '-9999px';
  preloadDiv.style.left = '-9999px';
  
  // 直接使用字体名称数组来确保所有字体都被预加载
  const fontFamilies = [
    'Microsoft YaHei,微软雅黑,SimHei,sans-serif',
    'SimSun',
    'MuyaoSoftbrush,Microsoft YaHei,Arial,sans-serif',
    'ZhanKuXiaoWeiLOGO,Microsoft YaHei,Arial,sans-serif',
    'YuYangTi,Microsoft YaHei,Arial,sans-serif',
    'Attemptyon,Microsoft YaHei,Arial,sans-serif'
  ];
  
  // 为每种字体创建一个预加载元素
  fontFamilies.forEach(fontFamily => {
    const fontSpan = document.createElement('span');
    fontSpan.style.fontFamily = fontFamily;
    fontSpan.textContent = '水印示例'; // 使用实际的水印文本
    fontSpan.style.fontSize = '36px'; // 使用足够大的字体大小
    preloadDiv.appendChild(fontSpan);
    preloadDiv.appendChild(document.createElement('br'));
  });
  
  document.body.appendChild(preloadDiv);
  
  // 使用FontFaceObserver来检测字体加载状态
  // 尝试强制字体加载
  setTimeout(() => {
    // 强制浏览器重新渲染
    preloadDiv.style.visibility = 'hidden';
    setTimeout(() => {
      preloadDiv.style.visibility = 'visible';
      
      // 10秒后移除预加载div
      setTimeout(() => {
        if (document.body.contains(preloadDiv)) {
          document.body.removeChild(preloadDiv);
        }
      }, 10000);
    }, 500);
  }, 1000);
}

// 保证页面加载后第一次drawPreview用的就是当前下拉菜单的字体
window.addEventListener('DOMContentLoaded', () => {
  wmParams.font = document.getElementById('wm-font').value;
  preloadFonts(); // 预加载所有字体
  drawPreview();
});

// 绘制水印操作手柄
function drawWatermarkHandles(wmBox, width, height) {
  const handleSize = 10;
  const padding = 10;
  
  // 计算四个角点位置（考虑旋转角度）
  const halfW = width/2 + padding;
  const halfH = height/2 + padding;
  const angle = wmBox.angle;
  
  // 四个角点相对于中心的位置
  const corners = [
    {x: -halfW, y: -halfH, type: 'scale'}, // 左上
    {x: halfW, y: -halfH, type: 'rotate'}, // 右上
    {x: halfW, y: halfH, type: 'scale'},   // 右下
    {x: -halfW, y: halfH, type: 'move'}    // 左下
  ];
  
  // 旋转计算实际坐标
  const rotatedCorners = corners.map(corner => {
    const rx = corner.x * Math.cos(angle) - corner.y * Math.sin(angle);
    const ry = corner.x * Math.sin(angle) + corner.y * Math.cos(angle);
    return {
      x: wmBox.centerX + rx,
      y: wmBox.centerY + ry,
      type: corner.type
    };
  });
  
  // 绘制手柄
  ctx.save();
  rotatedCorners.forEach(corner => {
    // 根据手柄类型设置样式
    if (corner.type === 'rotate') {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
    } else if (corner.type === 'scale') {
      ctx.fillStyle = 'rgba(100, 100, 255, 0.9)';
    } else {
      ctx.fillStyle = 'rgba(100, 255, 100, 0.9)';
    }
    
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, handleSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
  
  // 将手柄坐标保存到全局变量供交互使用
  window.watermarkHandles = rotatedCorners;
}

// 检测鼠标是否在手柄上
function getHandleAtPoint(x, y) {
  if (!window.watermarkHandles || !watermarkSelected) return null;
  
  const handleSize = 10;
  for (let i = 0; i < window.watermarkHandles.length; i++) {
    const handle = window.watermarkHandles[i];
    const dx = x - handle.x;
    const dy = y - handle.y;
    const distance = Math.sqrt(dx*dx + dy*dy);
    
    if (distance <= handleSize) {
      return handle;
    }
  }
  return null;
}

function isPointInWatermark(x, y) {
  // 计算当前水印的包围盒，判断(x,y)是否在内
  if (!previewImg) return false;
  
  let cw = previewCanvas.width, ch = previewCanvas.height;
  let pos = getCurrentXY();
  let fontSize = wmParams.size * Math.min(
    (document.getElementById('preview-section').offsetWidth-40)/previewImg.naturalWidth,
    600/previewImg.naturalHeight, 1
  );
  ctx.save();
  ctx.font = `${fontSize}px ${wmParams.font}`;
  let textW = ctx.measureText(wmParams.text).width;
  let textH = fontSize;
  ctx.restore();
  // 水印中心
  let cx = cw * pos.x;
  let cy = ch * pos.y;
  // 逆向旋转点
  let angle = -wmParams.rotate * Math.PI / 180;
  let dx = x - cx, dy = y - cy;
  let rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  let ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(rx) <= textW/2 && Math.abs(ry) <= textH/2;
}
