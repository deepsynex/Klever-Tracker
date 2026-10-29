/**
 * Partial reads for limited roles. When the role may not read one of a query's top-level fields,
 * the API fails the whole query (`data: null`). These helpers rebuild the query without the
 * refused fields, so the rest of a screen still loads, and stand in an empty value for them.
 */
import { Kind, parse, print, visit, type FieldNode, type OperationDefinitionNode } from "graphql";

/** The value a refused field reads as: an empty page for lists, null for anything else. */
function emptyValue(field: FieldNode): unknown {
  const isPage = field.selectionSet?.selections.some((s) => s.kind === Kind.FIELD && s.name.value === "data");
  return isPage ? { data: [], paginatorInfo: { total: 0 } } : null;
}

/**
 * `query` without the top-level fields named in `fields` (response keys, i.e. alias or name),
 * plus the empty values to put in their place. Variables no field uses any more are dropped too.
 * Null when nothing would be left to ask for, or the document isn't a single query.
 */
export function withoutRootFields(query: string, fields: string[]): { query: string; empty: Record<string, unknown> } | null {
  const doc = parse(query);
  const ops = doc.definitions.filter((d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION);
  if (ops.length !== 1 || ops[0]!.operation !== "query") return null;
  const op = ops[0]!;
  const drop = new Set(fields);
  const empty: Record<string, unknown> = {};
  const kept = op.selectionSet.selections.filter((s) => {
    if (s.kind !== Kind.FIELD) return true;
    const key = s.alias?.value ?? s.name.value;
    if (!drop.has(key)) return true;
    empty[key] = emptyValue(s);
    return false;
  });
  if (kept.length === 0 || Object.keys(empty).length === 0) return null;

  // Which variables the remaining fields still use.
  const used = new Set<string>();
  const trimmed: OperationDefinitionNode = { ...op, selectionSet: { ...op.selectionSet, selections: kept } };
  visit(trimmed.selectionSet, {
    Variable(node) {
      used.add(node.name.value);
    },
  });
  const finalOp: OperationDefinitionNode = {
    ...trimmed,
    variableDefinitions: op.variableDefinitions?.filter((v) => used.has(v.variable.name.value)),
  };
  return { query: print({ ...doc, definitions: doc.definitions.map((d) => (d === op ? finalOp : d)) }), empty };
}
