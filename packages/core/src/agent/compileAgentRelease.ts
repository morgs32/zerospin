import { mapValues } from 'es-toolkit';

import {
  QuerySelection,
  type IAnyQueryDbVersion,
} from '../models/make/makeQueryDbVersion.ts';

import { compileAgentSelections } from './compileAgentSelections.ts';
import {
  isAgentCommandRef,
  type IAgentCommandRefs,
} from './makeAgentCommandRef.ts';
import { compileAgentWake, type IAuthoredWakeRules } from './makeAgentWake.ts';

export type IAgentReleaseProps = Readonly<{
  agentName: string;
  agentVersion: number;
  sessionName: string;
  db: IAnyQueryDbVersion;
  selections: Readonly<Record<string, QuerySelection>>;
  contracts: IAgentCommandRefs;
}>;

/** A release is the Agent's session definition; each wake names one selected model. */
export function compileAgentRelease<const PROPS extends IAgentReleaseProps>(
  props: PROPS & {
    wakeRules?: IAuthoredWakeRules<NoInfer<PROPS['db']['models']>>;
  },
) {
  if ('callbacks' in props || 'initialize' in props || 'onWake' in props) {
    throw new Error('Agent releases declare wake behavior in wakeRules');
  }
  if (
    !props.agentName ||
    !props.sessionName ||
    !Number.isSafeInteger(props.agentVersion) ||
    props.agentVersion < 1
  ) {
    throw new Error(
      'Agent declarations require names and a positive safe integer version',
    );
  }
  mapValues(props.contracts, (contract, name) => {
    if (!isAgentCommandRef(contract) || contract.commandName !== name) {
      throw new Error(
        `Agent command ${String(name)} must reference a declared command of the same name`,
      );
    }
  });
  const selections = new Map<
    string,
    ReturnType<QuerySelection['prepareStructuredSelection']>
  >();
  mapValues(props.selections, (query, name) => {
    const model = props.db.models[name];
    if (!(query instanceof QuerySelection) || model === undefined) {
      throw new Error(`Invalid query selection ${String(name)}`);
    }
    selections.set(
      name,
      query.prepareStructuredSelection({ db: props.db, model, key: name }),
    );
  });
  mapValues(props.db.models, (_model, name) => {
    if (!selections.has(name)) {
      throw new Error(`Agent view model ${name} requires a selection`);
    }
  });
  const wakeRules = mapValues(props.wakeRules ?? {}, (rule, name) => {
    if (
      !name ||
      typeof rule?.wakeAt !== 'function' ||
      typeof rule.onWake?.program !== 'function' ||
      typeof rule.onWake.onFailure !== 'function'
    ) {
      throw new Error(
        'Agent wakes require a name, selection, wakeAt, onWake.program and onWake.onFailure',
      );
    }
    if (!selections.has(rule.selection)) {
      throw new Error(
        `Agent wake ${name} references undeclared selection ${rule.selection}`,
      );
    }
    return compileAgentWake(props.db.models[rule.selection]!, rule);
  });
  const {
    selections: _selections,
    wakeRules: _wakeRules,
    ...definition
  } = props;
  const contracts: PROPS['contracts'] = props.contracts;
  return {
    ...definition,
    selections: compileAgentSelections({ db: props.db, selections }),
    contracts: Object.freeze({ ...contracts }),
    wakeRules,
  };
}
