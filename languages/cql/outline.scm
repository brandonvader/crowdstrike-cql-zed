; The outline shows the stages of each pipeline, nested through subqueries,
; case/match branches and correlate() labels.

(pipeline
  (function_call
    name: (function_name) @name) @item)

(pipeline
  (saved_query
    name: (saved_query_name) @name) @item)

(pipeline
  (assignment
    left: (_) @name
    ":=" @context) @item)

(pipeline
  (field_shorthand
    field: (_) @name
    "=~" @context) @item)

(case_branch
  (function_call
    name: (function_name) @name) @item)

(case_branch
  (saved_query
    name: (saved_query_name) @name) @item)

(case_branch
  (assignment
    left: (_) @name
    ":=" @context) @item)

(case_branch
  (field_shorthand
    field: (_) @name
    "=~" @context) @item)

(case_statement
  "case" @name) @item

(match_statement
  field: (_) @name
  "match" @context) @item

(subquery
  label: (label) @name) @item
