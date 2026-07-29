import { deriveOutputName, formatBytes, validateFile } from './file-intake.js';

const $ = (selector) => document.querySelector(selector);
const elements = {
  dropzone: $('#dropzone'), fileInput: $('#file-input'), fileSummary: $('#file-summary'),
  fileName: $('#file-name'), fileSize: $('#file-size'), fileRemove: $('#file-remove'),
  form: $('#settings-form'), outputName: $('#output-name'), runButton: $('#run-button'),
  progressPanel: $('#progress-panel'), progressTitle: $('#progress-title'),
  progressMessage: $('#progress-message'), progressBar: $('#progress-bar'),
  resultPanel: $('#result-panel'), resultMessage: $('#result-message'),
  downloadButton: $('#download-button'), restartButton: $('#restart-button'),
  errorPanel: $('#error-panel'), errorMessage: $('#error-message'), errorClose: $('#error-close'),
  toast: $('#toast'),
};

let selectedFile = null;
let toastTimer = null;

function selectFile(file) {
  const validation = validateFile(file, { accept: elements.fileInput.accept });
  if (!validation.ok) return showError(validation.message);
  selectedFile = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  elements.fileSummary.hidden = false;
  elements.dropzone.hidden = true;
  elements.outputName.disabled = false;
  elements.outputName.value = deriveOutputName(file.name);
  elements.runButton.disabled = false;
  elements.resultPanel.hidden = true;
  elements.errorPanel.hidden = true;
}

function resetWorkspace() {
  selectedFile = null;
  elements.fileInput.value = '';
  elements.fileSummary.hidden = true;
  elements.dropzone.hidden = false;
  elements.outputName.value = '';
  elements.outputName.disabled = true;
  elements.runButton.disabled = true;
  elements.progressPanel.hidden = true;
  elements.resultPanel.hidden = true;
  elements.errorPanel.hidden = true;
  elements.progressBar.style.width = '0%';
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorPanel.hidden = false;
  elements.errorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
}

async function runDemoProcess() {
  if (!selectedFile) return showError('처리할 파일을 선택해 주세요.');
  elements.resultPanel.hidden = true;
  elements.errorPanel.hidden = true;
  elements.progressPanel.hidden = false;
  elements.runButton.disabled = true;

  const steps = [[18, '파일을 확인하고 있습니다.'], [52, '데이터를 처리하고 있습니다.'], [84, '결과를 준비하고 있습니다.'], [100, '완료했습니다.']];
  for (const [progress, message] of steps) {
    elements.progressMessage.textContent = message;
    elements.progressBar.style.width = `${progress}%`;
    await new Promise((resolve) => setTimeout(resolve, 360));
  }

  elements.progressPanel.hidden = true;
  elements.resultMessage.textContent = `${elements.outputName.value || 'output'} 결과를 저장할 수 있습니다.`;
  elements.resultPanel.hidden = false;
  elements.runButton.disabled = false;
  elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

elements.dropzone.addEventListener('click', () => elements.fileInput.click());
elements.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fileInput.click(); }
});
['dragenter', 'dragover'].forEach((name) => elements.dropzone.addEventListener(name, (event) => { event.preventDefault(); elements.dropzone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((name) => elements.dropzone.addEventListener(name, (event) => { event.preventDefault(); elements.dropzone.classList.remove('is-dragging'); }));
elements.dropzone.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));
elements.fileInput.addEventListener('change', () => selectFile(elements.fileInput.files[0]));
elements.fileRemove.addEventListener('click', resetWorkspace);
elements.form.addEventListener('reset', () => requestAnimationFrame(resetWorkspace));
elements.form.addEventListener('submit', (event) => { event.preventDefault(); runDemoProcess().catch((error) => showError(error.message)); });
elements.restartButton.addEventListener('click', resetWorkspace);
elements.errorClose.addEventListener('click', () => { elements.errorPanel.hidden = true; });
elements.downloadButton.addEventListener('click', () => showToast('실제 처리 결과의 다운로드 로직을 연결하세요.'));
