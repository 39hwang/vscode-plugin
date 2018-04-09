'use strict';

const vscode = require('vscode');
const server = require('./server');
const {AUTOCORRECT_SHOW_SIDEBAR, AUTOCORRECT_DONT_SHOW_SIDEBAR} = require('./constants');
const URI = vscode.Uri.parse('kite-vscode-error-rescue://error-rescue');
const {wrapHTML, debugHTML, stripLeadingSlash} = require('./html-utils');
const relativeDate = require('tiny-relative-date');
let instance;

server.addRoute('GET', `/error-rescue/toggle/on`, (req, res, url) => {
  try {
    const config = vscode.workspace.getConfiguration('kite');
    config.update('enableErrorRescue', true, true);
    setTimeout(() => instance.update(), 100);
    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', `/error-rescue/toggle/off`, (req, res, url) => {
  try {
    const config = vscode.workspace.getConfiguration('kite');
    config.update('enableErrorRescue', false, true);
    setTimeout(() => instance.update(), 100);
    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', `/error-rescue/switch/${AUTOCORRECT_SHOW_SIDEBAR}`, (req, res, url) => {
  try {
    const config = vscode.workspace.getConfiguration('kite');
    config.update('actionWhenErrorRescueFixesCode', AUTOCORRECT_SHOW_SIDEBAR, true);  
    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', `/error-rescue/switch/${AUTOCORRECT_DONT_SHOW_SIDEBAR}`, (req, res, url) => {
  try {
    const config = vscode.workspace.getConfiguration('kite');
    config.update('actionWhenErrorRescueFixesCode', AUTOCORRECT_DONT_SHOW_SIDEBAR, true);  
    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', '/error-rescue/feedback/ok', (req, res, url) => {
  try {
    const kiteEditor = instance.lastKiteEditor
  
    if(kiteEditor && kiteEditor.fixesHistory) {
      kiteEditor.postErrorRescueFeedbackData(kiteEditor.lastCorrectionsData, 1).then(() => {
        kiteEditor.lastCorrectionsData.feedbackSent = 1
        instance.update();
      });
    }
  
    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', '/error-rescue/feedback/ko', (req, res, url) => {
  try {
    const kiteEditor = instance.lastKiteEditor

    if(kiteEditor && kiteEditor.fixesHistory) {
      kiteEditor.postErrorRescueFeedbackData(kiteEditor.lastCorrectionsData, -1).then(() => {
        kiteEditor.lastCorrectionsData.feedbackSent = -1
        instance.update();
      });
    }

    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

server.addRoute('GET', '/error-rescue/close-message', (req, res, url) => {
  try {
    delete instance.message;
    instance.update();

    res.writeHead(200);
    res.end();
  } catch(err) {
    console.log(err)
    res.writeHead(500);
    res.end();
  }
});

module.exports = class KiteErrorRescue {
  constructor(Kite) {
    server.start();

    this.Kite = Kite;
    instance = this;
    this.messages = [];
    this.didChangeEmitter = new vscode.EventEmitter();
    vscode.window.onDidChangeActiveTextEditor(e => {
      this.update();
      this.Kite.autocorrectStatusBarItem.hide();
    });
    vscode.workspace.onDidCloseTextDocument(doc => {
      if (doc.uri.toString().indexOf('kite-vscode-error-rescue://') === 0) {
        delete this.isSidebarOpen;
      }
    });
  }
  
  get onDidChange() {
    return this.didChangeEmitter.event; 
  }
  
  open() {
    if (this.isSidebarOpen) {
      this.update();
    } else {
      vscode.commands.executeCommand('vscode.previewHtml', URI, vscode.ViewColumn.Two, 'Kite');
      this.isSidebarOpen = true;
    }
  } 

  update() {
    this.didChangeEmitter.fire(URI);
  }

  showFirstRunExperience() {
    this.message = `<h4>Kite error rescue just fixed your code for the first time</h4>
    <p>
      Error Rescue will automatically fix the most common mistakes when
      you save your file. It uses machine learning
      and your feedback to constantly get better.
    </p>
    <a href="https://help.kite.com/article/78-what-is-error-rescue">Learn about Error Rescue</a>`;
    this.open();
  }
  
  loadModelInfo(version) {
    const kiteEditor = vscode.window.activeTextEditor 
      ? this.Kite.kiteEditorByEditor.get(vscode.window.activeTextEditor.document.fileName)
      : this.lastKiteEditor;

    if(kiteEditor) {
      kiteEditor.getErrorRescueModelInfo(version)
      .then(data => {
        // We don't want the model update info to be displayed if we already have the first run exp
        if (!this.message) {
          this.message = `<h4>Just added: New code fixes</h4>
          ${data.examples.map((e) => {
            return `
              <p>${e.synopsis}</p>
              ${this.renderDiff(e)}`;
          }).join('')}
          <a href="https://help.kite.com/article/78-what-is-error-rescue">Learn about Error Rescue</a>`;
        }
        this.open();
      })
    }
  }

  dispose() {
    this.subscription.dispose();
  }

  provideTextDocumentContent() {
    const kiteEditor = vscode.window.activeTextEditor 
      ? this.Kite.kiteEditorByEditor.get(vscode.window.activeTextEditor.document.fileName)
      : this.lastKiteEditor

    if(kiteEditor && kiteEditor.fixesHistory) {
      this.lastKiteEditor = kiteEditor
      const config = vscode.workspace.getConfiguration('kite');
      
      return Promise.resolve(`
      <div class="kite-error-rescue-sidebar">
        <div class="kite-column">
          <div class="messages">${
            this.message 
              ? `<div class="message-box">
                <button class="btn btn-close" onclick="requestGet('/error-rescue/close-message')">x</button>
                ${this.message}
              </div>`
              : ''
          }</div>
          <div class="settings-view ${config.enableErrorRescue ? 'error-rescue-enabled' : ''}">
            <a href="https://help.kite.com/article/78-what-is-error-rescue" title="Learn about Error Rescue" class="icon icon-question"></a>
            <div class="settings-panel">
              <div class="control-group checkbox ${config.enableErrorRescue ? 'checked' : ''}">
                <label>
                  <input type="checkbox" class="input-toggle" ${config.enableErrorRescue ? 'checked' : ''} onchange="requestGet('/error-rescue/toggle/' + (this.checked ? 'on' : 'off'))"></input>
                  <div class="setting-title">Enable Error Rescue</div>
                </label>
              </div>
              <div class="control-group select">
                <label>
                  <div class="setting-title">Any time code is fixed:</div>
                  <select type="checkbox" class="form-control" onchange="requestGet('/error-rescue/switch/' + this.value)">
                    <option value="${AUTOCORRECT_SHOW_SIDEBAR}" ${config.actionWhenErrorRescueFixesCode === AUTOCORRECT_SHOW_SIDEBAR ? 'selected' : ''}>Reopen this sidebar</option>
                    <option value="${AUTOCORRECT_DONT_SHOW_SIDEBAR}" ${config.actionWhenErrorRescueFixesCode === AUTOCORRECT_DONT_SHOW_SIDEBAR ? 'selected' : ''}>Do nothing (fix code quietly)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div class="content">${this.renderDiffs([
            kiteEditor.fixesHistory,
            kiteEditor.document.fileName,
            kiteEditor,
          ])}</div>
        </div>
      </div>`)
      .then(html => wrapHTML(html))
      .then(html => debugHTML(html));
    } else {
      return '';
    }
  }

  renderDiffs([history, filename, kiteEditor] = []) {
    if (history && history.length) {
      const diffsHTML = history.map((fix, index) => {
        const {line, character} = kiteEditor.document.positionAt(fix.diffs[0].new_buffer_offset_bytes);

        const defData = JSON.stringify({
          file: filename,
          line: line + 1,
          character: character + 1,
          source: 'ErrorRescue',
        });

        return `<div class="diff ${index === 0 ? 'recent' : ''}">
          ${this.diffTitle(index)}
          <div class="timestamp">
            Fixed ${relativeDate(fix.timestamp)}:
          </div>
          ${fix.diffs.map(diff => this.renderDiff(diff)).join('')}
          <div class="feedback-actions ${kiteEditor.lastCorrectionsData.feedbackSent ? 'feedback-sent' : ''}">
            <a href='command:kite.def?${defData}' aria-label="">Go to code</a>
            <a class="thumb-up ${kiteEditor.lastCorrectionsData.feedbackSent == 1 ? 'clicked' : ''}" 
               href="#"
               aria-label="Send feedback to Kite if you like this change"
               onclick="requestGet('/error-rescue/feedback/ok')"
               onmouseover="showFeedbackFeedback(this, this.getAttribute('aria-label'), {confirmation: false})"
               onmouseout="hideFeedbackFeedback(this)">👍</a>
            <a class="thumb-down ${kiteEditor.lastCorrectionsData.feedbackSent == -1 ? 'clicked' : ''}"
               href="#"
               aria-label="Send feedback to Kite if you don’t like this change"
               onclick="requestGet('/error-rescue/feedback/ko')"
               onmouseover="showFeedbackFeedback(this, this.getAttribute('aria-label'), {confirmation: false})"
               onmouseout="hideFeedbackFeedback(this)">👎</a>
            <span class="feedback-feedback ${kiteEditor.lastCorrectionsData.feedbackSent ? 'confirmation' : ''}">${kiteEditor.lastCorrectionsData.feedbackSent ? 'Thank you for your feedback!' : ''}</span>
          </div>
        </div>`
      }).join('');

      return `<div class="diffs">${diffsHTML}</div>`;
    } else {
      return `<div class="diff">
        <h4>Most recent code fixes</h4>
        <div class="diffs">No fixes made to ${filename} yet.</div>
      </div>`;
    }
  }

  renderDiff(diff) {
    return [
      '<code class="diff-content">',
      (diff.deleted || diff.old).map(del => `<del>
          ${del.line != null ? `<div class="line-number">${del.line + 1}</div>` : ''}
          <div class="line">${this.addEmphasis(del.text, del.emphasis)}</div>
        </del>`).join(''),
      (diff.inserted || diff.new).map(ins => `<ins>
          ${ins.line != null ? `<div class="line-number">${ins.line + 1}</div>` : ''}
          <div class="line">${this.addEmphasis(ins.text, ins.emphasis)}</div>
        </ins>`).join(''),
      '</code>',
    ].join('');
  }

  addEmphasis(text, emphasis = []) {
    let offset = 0;
    const offsetIncrement = '<strong></strong>'.length;

    return emphasis && emphasis.length
      ? emphasis.reduce((t, {start_runes, end_runes}) => {
        const newText = `${
          text.slice(0, start_runes + offset)
        }<strong>${
          text.slice(start_runes + offset, end_runes + offset)
        }</strong>${
          text.slice(end_runes + offset)
        }`;

        offset += offsetIncrement;

        return newText;
      }, text)
      : text;
  }

  diffTitle(index) {
    switch (index) {
      case 0:
        return `<h4>Most recent code fixes</h4>`;
      case 1:
        return `<h4>Earlier fixes</h4>`;
      default:
        return '';
    }
  }
}