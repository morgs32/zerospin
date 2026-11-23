const blankLineBeforeClassMethod = {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    schema: [],
    messages: {
      missingBlankLine:
        'Add a blank line before this class method or its annotation.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      ClassBody(node) {
        for (let index = 1; index < node.body.length; index += 1) {
          const method = node.body[index];
          if (
            method.type !== 'MethodDefinition' &&
            method.type !== 'TSAbstractMethodDefinition'
          ) {
            continue;
          }

          let annotation = method.decorators[0] ?? method;
          let previous = sourceCode.getTokenBefore(annotation);
          for (const comment of sourceCode.getCommentsBefore(annotation)) {
            // Same-line comments, including multiline blocks, belong to the prior member.
            if (comment.loc.start.line === previous.loc.end.line) {
              previous = comment;
            } else {
              annotation = comment;
              break;
            }
          }

          const gap = sourceCode.text.slice(
            previous.range[1],
            annotation.range[0],
          );
          const lineBreaks = gap.match(/\r\n|\r|\n/g) ?? [];
          if (lineBreaks.length >= 2) continue;

          context.report({
            node: method,
            messageId: 'missingBlankLine',
            fix(fixer) {
              const eol =
                lineBreaks[0] ??
                sourceCode.text.match(/\r\n|\r|\n/)?.[0] ??
                '\n';
              const insertion =
                lineBreaks.length === 0
                  ? previous.range[1]
                  : previous.range[1] + gap.indexOf(eol) + eol.length;
              return fixer.insertTextBeforeRange(
                [insertion, insertion],
                eol.repeat(2 - lineBreaks.length),
              );
            },
          });
        }
      },
    };
  },
};

/** Generated capability families expose only their declaration record and terminal refusals. */
const rpcDeclaredMethods = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      undeclared:
        'Declare RPC methods through makeRpcApi; public prototype members and TypeScript-only private members bypass decoding.',
      factory:
        'This capability must extend makeRpcApi with an explicit method declaration record.',
      state:
        'Retain capability state in native private fields or an Initialized instance layer; TypeScript visibility does not hide it from RPC.',
    },
  },
  create(context) {
    const families = new Set([
      'GatewayApi',
      'SystemApi',
      'AggregateApi',
      'ServiceApi',
      'AggregateAccessApi',
      'ServiceAccessApi',
      'AggregateSessionApi',
      'ServiceSessionApi',
    ]);
    const filename = context.filename ?? context.getFilename();
    if (
      !filename.replaceAll('\\', '/').includes('packages/system-worker/src/')
    ) {
      return {};
    }
    const terminalMethods = {
      SystemApiFailure: new Set([
        'healthcheck',
        'initialize',
        'executeServiceQuery',
        'executeAggregateCommand',
        'executeAggregateQuery',
        'executeServiceCommand',
        'preflightDeployment',
        'acceptSystemSpec',
        'getExecutingWorkerVersion',
        'getRepoRegistrations',
        'getRepoTableRows',
        'makeSystemSpec',
        'openAggregateAgentSession',
        'openServiceAgentSession',
        'getAgentAggregateIds',
      ]),
      AggregateApiFailure: new Set(['authenticate']),
      ServiceApiFailure: new Set(['admit']),
      AggregateAccessApiFailure: new Set(['openSession']),
      ServiceAccessApiFailure: new Set(['authorize']),
      AggregateSessionApiFailure: new Set([
        'getSnapshot',
        'registerNode',
        'createWebSocketTicket',
        'getBrowserCommands',
        'executeServiceQuery',
      ]),
      ServiceSessionApiFailure: new Set([
        'getSnapshot',
        'registerNode',
        'getBrowserCommands',
        'createWebSocketTicket',
      ]),
    };
    const generated = new Set();
    const classes = [];
    const symbols = new Set();
    return {
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee.name === 'Symbol'
        ) {
          symbols.add(node.id.name);
        }
      },
      ClassDeclaration(node) {
        classes.push(node);
      },
      'Program:exit'() {
        for (const node of classes) {
          if (
            node.superClass?.type === 'CallExpression' &&
            node.superClass.callee.name === 'makeRpcApi'
          ) {
            generated.add(node.id.name);
          }
        }
        // Include local inherited surfaces as well as the named capability family.
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of classes) {
            if (
              node.superClass?.type === 'Identifier' &&
              generated.has(node.superClass.name) &&
              !generated.has(node.id.name)
            ) {
              generated.add(node.id.name);
              changed = true;
            }
          }
        }
        for (const node of classes) {
          const name = node.id.name;
          const terminal = terminalMethods[name];
          if (!generated.has(name) && !families.has(name) && !terminal) {
            continue;
          }
          if (
            families.has(name) &&
            (!generated.has(name) ||
              node.superClass.arguments?.[1]?.type !== 'ObjectExpression')
          ) {
            context.report({ node, messageId: 'factory' });
          }
          for (const member of node.body.body) {
            if (member.key?.type === 'PrivateIdentifier' || member.static) {
              continue;
            }
            if (
              member.computed &&
              member.key?.type === 'Identifier' &&
              symbols.has(member.key.name)
            ) {
              continue;
            }
            if (member.kind === 'constructor') {
              for (const param of member.value.params) {
                if (param.type === 'TSParameterProperty') {
                  context.report({ node: param, messageId: 'state' });
                }
              }
              continue;
            }
            if (
              terminal &&
              member.type === 'MethodDefinition' &&
              member.kind === 'method' &&
              member.accessibility !== 'private' &&
              member.accessibility !== 'protected' &&
              !member.computed &&
              terminal.has(member.key.name)
            ) {
              continue;
            }
            context.report({
              node: member,
              messageId:
                member.type === 'PropertyDefinition' ? 'state' : 'undeclared',
            });
          }
        }
      },
    };
  },
};

// Oxlint loads local JavaScript plugins from their default export.
// oxlint-disable-next-line import/no-default-export
export default {
  meta: { name: 'zerospin' },
  rules: {
    'blank-line-before-class-method': blankLineBeforeClassMethod,
    'rpc-declared-methods': rpcDeclaredMethods,
  },
};
