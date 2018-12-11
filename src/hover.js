'use strict';

const vscode = require('vscode');
const {Hover} = vscode;
const {hoverPath} = require('./urls');
const {compact, escapeCommandArguments} = require('./utils');
const {symbolName, symbolKind, symbolId, idIsEmpty} = require('./data-utils');

module.exports = class KiteHoverProvider {
  constructor (Kite, isTest) {
    this.Kite = Kite;
    this.isTest = isTest;
  }

  provideHover(doc, position) {
    // hueristic - based on how editors are registered for whitelisting based on
    // documents, it should be sufficient to see if just one passes the check below
    if (this.isTest || this.Kite.isDocumentWhitelisted(doc)) {
      const path = hoverPath(doc, position);
      return this.Kite.request({path})
      .then(data => JSON.parse(data))
      .then(data => {
        if (data && data.symbol && data.symbol.length) {
          const [symbol] = data.symbol;

          const docsLink = `[Docs](command:kite.more-position?${escapeCommandArguments({
            position,
            source: 'Hover',
          })})`;

          let defLink;
          if (data && data.report && data.report.definition && data.report.definition.filename !== '') {
            const defData = escapeCommandArguments({
              file: data.report.definition.filename,
              line: data.report.definition.line,
              source: 'Hover',
            });
            defLink = `[Def](command:kite.def?${defData})`;
          }

          const content = new vscode.MarkdownString(`[𝕜𝕚𝕥𝕖]&nbsp;&nbsp;__${symbolName(symbol)}__&nbsp;&nbsp;${docsLink}${defLink ? '&nbsp;&nbsp;' + defLink : ''}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;_${symbolKind(symbol)}_`);
          content.isTrusted = true;

          const texts = [
            content
          ];

          // const texts = [{
          //     language: 'python',
          //     value: `[𝕜𝕚𝕥𝕖] ${symbolName(symbol)}${docsLink}    ${symbolKind(symbol)}`
          //   },
          // ];

          // const links = [];

          // if (!idIsEmpty(id)) {
          //   links.push(`[docs](command:kite.more-position?${escapeCommandArguments({
          //     position,
          //     source: 'Hover',
          //   })})`);
          // } else {
          //   links.push(`[docs](command:kite.more-position?${escapeCommandArguments({
          //     position,
          //     source: 'Hover',
          //   })})`);
          // }

          // if (data && data.report && data.report.definition && data.report.definition.filename !== '') {
          //   const defData = escapeCommandArguments({
          //     file: data.report.definition.filename,
          //     line: data.report.definition.line,
          //     source: 'Hover',
          //   });
          //   links.push(`[def](command:kite.def?${defData})`);
          // }

          // if (links.length) {
          //   const md = new vscode.MarkdownString('**Kite:** ' + links.join(' '))
          //   md.isTrusted = true;
          //   texts.push(md);
          // }

          return new Hover(compact(texts));
        }
      })
      .catch(() => {});
    } else {
      Promise.resolve();
    }
  }
}
