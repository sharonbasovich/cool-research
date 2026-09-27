import { mountLayout } from './shared/layout';

const main = mountLayout(0);
main.innerHTML = `
  <h1>Majority dynamics on sparse random graphs: a companion</h1>
  <p>Interactive companions to Gopal Goel and Ashwin Sah, <em>Majority dynamics on sparse random graphs</em>
  (<a href="https://arxiv.org/abs/2609.14957">arXiv:2609.14957</a>,
  <a href="https://gopalkgoel.github.io/majority-dynamics/">essay</a>,
  <a href="https://gopalkgoel.github.io/majority-dynamics/atlas/">proof atlas</a>,
  <a href="https://github.com/gopalkgoel/sparse-majority-dynamics-lean">Lean formalization</a>).</p>
`;
