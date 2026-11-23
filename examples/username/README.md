# Username example spike

This example sketches a hosted user actor that creates `usr_user` with a null
username and a standalone story that stages the same command once. The page
stages `updateUsername` and renders a greeting for a string username. Submitting
whitespace stores null.

The shells are intentionally non-compiling. The planned Storybook host is
`username.zerospin.localhost`.

<!-- TODO Use the scripts and Portless wiring in examples/list-system/package.json
     and the host configuration in examples/list-system/.storybook/main.ts. -->
