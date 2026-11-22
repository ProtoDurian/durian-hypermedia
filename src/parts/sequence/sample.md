Who calls whom, in order. A call is a solid arrow, a reply a dashed one; a block (`loop`, `alt`, `opt`, `par`) frames the messages inside it. An LLM reads the messages as a numbered list.

```sequence title="One init call"
actor dev "developer"
participant cli "CLI"
participant tc "template container"
dev -> cli: cyanprint create
cli -> tc: init call, all answers
tc --> cli: question reply
note tc: the script stopped at a question
loop until no question is left
  cli -> tc: init call, one more answer
  tc --> cli: question reply
end
cli --> dev: project written
```

With `@step` lines the story builds up one call a step: the earlier calls fade and the new one draws itself.

```sequence
participant cli "CLI"
participant tc "template container"
@step The CLI sends an init call with every answer it holds.
cli -> tc: init call: all answers
@step The script stops at a question and sends it back.
tc --> cli: question reply
@step The next init call carries one answer more.
cli -> tc: init call: one more answer
```
