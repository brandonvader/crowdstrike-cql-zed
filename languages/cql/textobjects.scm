(function_call
  arguments: (argument_list) @function.inside) @function.around

(subquery
  "{"
  (_)? @class.inside
  "}") @class.around

(case_statement) @class.around
(match_statement) @class.around

(line_comment)+ @comment.around
(block_comment) @comment.around
