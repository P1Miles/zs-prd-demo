import sqlglot
from sqlglot import exp

class UnsafeQuery(ValueError):
    pass

# Deliberately small first-release grammar; unknown constructs fail closed.
ALLOWED = set('Select From Table Identifier Column Alias Literal Star Where EQ NEQ GT GTE LT LTE And Or Not Paren Is Null Boolean In Between Group Order Ordered Limit Offset Distinct Sum Count Avg Min Max Add Sub Mul Div Mod Neg Cast DataType DataTypeParam Case If Coalesce Nullif Having Placeholder'.split())

def validate(sql: str):
    if not sql.strip() or len(sql) > 20000:
        raise UnsafeQuery('SQL为空或超过长度限制')
    try:
        trees = sqlglot.parse(sql, read='duckdb')
    except sqlglot.errors.ParseError:
        raise UnsafeQuery('SQL无法解析，请检查语法')
    if len(trees) != 1 or not isinstance(trees[0], exp.Select):
        raise UnsafeQuery('当前版本仅允许单条SELECT查询')
    tree = trees[0]
    nodes = list(tree.walk())
    if len(nodes) > 500:
        raise UnsafeQuery('查询过于复杂，请简化')
    for node in nodes:
        if type(node).__name__ not in ALLOWED:
            raise UnsafeQuery('查询包含当前版本未开放的语法或函数')
        if isinstance(node, exp.Table):
            if not isinstance(node.this, exp.Identifier) or node.name != 'data' or node.db or node.catalog:
                raise UnsafeQuery('只能查询当前数据集的data表')
    return tree.sql(dialect='duckdb')


def repair_preserves_intent(original, repaired, columns):
    """Only an unambiguous one-character identifier typo may change; everything else is frozen."""
    def distance_one(a,b):
        if a==b:return False
        if abs(len(a)-len(b))>1:return False
        if len(a)==len(b):return sum(x!=y for x,y in zip(a,b))==1
        if len(a)>len(b):a,b=b,a
        return any(b[:i]+b[i+1:]==a for i in range(len(b)))
    try:
        before=validate(original);after=validate(repaired)
        tree=sqlglot.parse_one(before,read='duckdb')
        aliases={n.alias for n in tree.find_all(exp.Alias)}
        changed=False
        for col in tree.find_all(exp.Column):
            if col.name not in columns and col.name not in aliases:
                candidates=[name for name in columns if distance_one(col.name,name)]
                if len(candidates)!=1:return False
                col.set('this',exp.Identifier(this=candidates[0],quoted=True));changed=True
        target=sqlglot.parse_one(after,read='duckdb')
        # Quoting style is not business semantics. Identifiers remain case-sensitive here.
        for ast in (tree,target):
            for node in ast.find_all(exp.Identifier):node.set('quoted',True)
        return changed and tree==target
    except (UnsafeQuery,sqlglot.errors.ParseError):return False
