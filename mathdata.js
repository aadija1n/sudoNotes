/* Phase 10C2: Math symbol dataset (~250 symbols, grouped with keyword search).
   window.NotesMathData */

(function (global) {
  const GROUPS = [
    "Greek",
    "Operators",
    "Relations",
    "Arrows",
    "Logic & Sets",
    "Calculus",
    "Linear Algebra",
    "Physics & Chem",
    "Computer Science",
    "Probability",
  ];

  const SYMBOLS = [
    // Greek Lowercase
    { tex: "\\alpha", name: "alpha", group: "Greek", kw: "a greek" },
    { tex: "\\beta", name: "beta", group: "Greek", kw: "b greek" },
    { tex: "\\gamma", name: "gamma", group: "Greek", kw: "g greek" },
    { tex: "\\delta", name: "delta", group: "Greek", kw: "d greek" },
    { tex: "\\epsilon", name: "epsilon", group: "Greek", kw: "e greek" },
    { tex: "\\varepsilon", name: "varepsilon", group: "Greek", kw: "e curly greek" },
    { tex: "\\zeta", name: "zeta", group: "Greek", kw: "z greek" },
    { tex: "\\eta", name: "eta", group: "Greek", kw: "h greek" },
    { tex: "\\theta", name: "theta", group: "Greek", kw: "th greek" },
    { tex: "\\vartheta", name: "vartheta", group: "Greek", kw: "th curly greek" },
    { tex: "\\iota", name: "iota", group: "Greek", kw: "i greek" },
    { tex: "\\kappa", name: "kappa", group: "Greek", kw: "k greek" },
    { tex: "\\lambda", name: "lambda", group: "Greek", kw: "l greek" },
    { tex: "\\mu", name: "mu", group: "Greek", kw: "m micro greek" },
    { tex: "\\nu", name: "nu", group: "Greek", kw: "n greek" },
    { tex: "\\xi", name: "xi", group: "Greek", kw: "x greek" },
    { tex: "\\pi", name: "pi", group: "Greek", kw: "p 3.14 greek" },
    { tex: "\\rho", name: "rho", group: "Greek", kw: "r greek" },
    { tex: "\\sigma", name: "sigma", group: "Greek", kw: "s greek" },
    { tex: "\\tau", name: "tau", group: "Greek", kw: "t greek" },
    { tex: "\\upsilon", name: "upsilon", group: "Greek", kw: "u greek" },
    { tex: "\\phi", name: "phi", group: "Greek", kw: "f phi greek" },
    { tex: "\\varphi", name: "varphi", group: "Greek", kw: "phi curly greek" },
    { tex: "\\chi", name: "chi", group: "Greek", kw: "ch greek" },
    { tex: "\\psi", name: "psi", group: "Greek", kw: "ps greek" },
    { tex: "\\omega", name: "omega", group: "Greek", kw: "w ohm greek" },

    // Greek Uppercase
    { tex: "\\Gamma", name: "Gamma", group: "Greek", kw: "G greek upper" },
    { tex: "\\Delta", name: "Delta", group: "Greek", kw: "D triangle greek upper" },
    { tex: "\\Theta", name: "Theta", group: "Greek", kw: "Th greek upper" },
    { tex: "\\Lambda", name: "Lambda", group: "Greek", kw: "L greek upper" },
    { tex: "\\Xi", name: "Xi", group: "Greek", kw: "X greek upper" },
    { tex: "\\Pi", name: "Pi", group: "Greek", kw: "P product greek upper" },
    { tex: "\\Sigma", name: "Sigma", group: "Greek", kw: "S sum greek upper" },
    { tex: "\\Upsilon", name: "Upsilon", group: "Greek", kw: "U greek upper" },
    { tex: "\\Phi", name: "Phi", group: "Greek", kw: "Ph greek upper" },
    { tex: "\\Psi", name: "Psi", group: "Greek", kw: "Ps greek upper" },
    { tex: "\\Omega", name: "Omega", group: "Greek", kw: "O ohm greek upper" },

    // Operators
    { tex: "\\pm", name: "plus-minus", group: "Operators", kw: "+- plus minus" },
    { tex: "\\mp", name: "minus-plus", group: "Operators", kw: "-+ minus plus" },
    { tex: "\\times", name: "times", group: "Operators", kw: "* multiply cross" },
    { tex: "\\div", name: "divide", group: "Operators", kw: "/ division" },
    { tex: "\\cdot", name: "cdot", group: "Operators", kw: ". dot product multiply" },
    { tex: "\\circ", name: "circle", group: "Operators", kw: "deg degree compose circle" },
    { tex: "\\oplus", name: "oplus", group: "Operators", kw: "xor direct sum plus circle" },
    { tex: "\\otimes", name: "otimes", group: "Operators", kw: "tensor product times circle" },
    { tex: "\\odot", name: "odot", group: "Operators", kw: "dot circle" },
    { tex: "\\star", name: "star", group: "Operators", kw: "star asterisk" },
    { tex: "\\ast", name: "asterisk", group: "Operators", kw: "asterisk star" },
    { tex: "\\bullet", name: "bullet", group: "Operators", kw: "bullet point" },
    { tex: "\\dagger", name: "dagger", group: "Operators", kw: "dagger adjoint" },

    // Relations
    { tex: "\\le", name: "less than or equal", group: "Relations", kw: "<= leq less equal" },
    { tex: "\\ge", name: "greater than or equal", group: "Relations", kw: ">= geq greater equal" },
    { tex: "\\ne", name: "not equal", group: "Relations", kw: "!= neq not equal" },
    { tex: "\\approx", name: "approx", group: "Relations", kw: "~= estimate almost equal" },
    { tex: "\\equiv", name: "equivalent", group: "Relations", kw: "=== identity mod congruence" },
    { tex: "\\sim", name: "similar", group: "Relations", kw: "~ tilde proportional" },
    { tex: "\\propto", name: "proportional", group: "Relations", kw: "proportional to" },
    { tex: "\\ll", name: "much less", group: "Relations", kw: "<< much less than" },
    { tex: "\\gg", name: "much greater", group: "Relations", kw: ">> much greater than" },
    { tex: "\\cong", name: "congruent", group: "Relations", kw: "congruent isomorphic" },
    { tex: "\\perp", name: "perpendicular", group: "Relations", kw: "orthogonal perp normal" },
    { tex: "\\parallel", name: "parallel", group: "Relations", kw: "parallel lines" },

    // Arrows
    { tex: "\\to", name: "to / rightarrow", group: "Arrows", kw: "-> right arrow implies" },
    { tex: "\\leftarrow", name: "leftarrow", group: "Arrows", kw: "<- left arrow" },
    { tex: "\\leftrightarrow", name: "leftrightarrow", group: "Arrows", kw: "<-> left right arrow" },
    { tex: "\\Rightarrow", name: "implies", group: "Arrows", kw: "=> double right arrow implies" },
    { tex: "\\Leftarrow", name: "implied by", group: "Arrows", kw: "<= double left arrow" },
    { tex: "\\Leftrightarrow", name: "iff", group: "Arrows", kw: "<=> if and only if equivalent" },
    { tex: "\\mapsto", name: "maps to", group: "Arrows", kw: "|-> mapsto function" },
    { tex: "\\uparrow", name: "up arrow", group: "Arrows", kw: "^ up" },
    { tex: "\\downarrow", name: "down arrow", group: "Arrows", kw: "v down" },
    { tex: "\\longleftrightarrow", name: "long left right", group: "Arrows", kw: "long arrow" },
    { tex: "\\rightleftharpoons", name: "equilibrium", group: "Arrows", kw: "equilibrium reaction chem" },

    // Logic & Sets
    { tex: "\\forall", name: "for all", group: "Logic & Sets", kw: "universal quantifier forall" },
    { tex: "\\exists", name: "exists", group: "Logic & Sets", kw: "existential quantifier exists" },
    { tex: "\\neg", name: "not", group: "Logic & Sets", kw: "not negation logic" },
    { tex: "\\land", name: "and", group: "Logic & Sets", kw: "and conjunction logic wedge" },
    { tex: "\\lor", name: "or", group: "Logic & Sets", kw: "or disjunction logic vee" },
    { tex: "\\in", name: "in", group: "Logic & Sets", kw: "element of member belongs" },
    { tex: "\\notin", name: "not in", group: "Logic & Sets", kw: "not element of" },
    { tex: "\\subset", name: "subset", group: "Logic & Sets", kw: "subset proper" },
    { tex: "\\subseteq", name: "subset or equal", group: "Logic & Sets", kw: "subset equal" },
    { tex: "\\supset", name: "superset", group: "Logic & Sets", kw: "superset" },
    { tex: "\\supseteq", name: "superset or equal", group: "Logic & Sets", kw: "superset equal" },
    { tex: "\\cup", name: "union", group: "Logic & Sets", kw: "union cup or" },
    { tex: "\\cap", name: "intersection", group: "Logic & Sets", kw: "intersection cap and" },
    { tex: "\\setminus", name: "set difference", group: "Logic & Sets", kw: "\\ without minus set" },
    { tex: "\\emptyset", name: "empty set", group: "Logic & Sets", kw: "empty null set void" },
    { tex: "\\mathbb{N}", name: "Natural numbers", group: "Logic & Sets", kw: "N natural numbers" },
    { tex: "\\mathbb{Z}", name: "Integers", group: "Logic & Sets", kw: "Z integers" },
    { tex: "\\mathbb{Q}", name: "Rational numbers", group: "Logic & Sets", kw: "Q rationals fraction" },
    { tex: "\\mathbb{R}", name: "Real numbers", group: "Logic & Sets", kw: "R real numbers continuum" },
    { tex: "\\mathbb{C}", name: "Complex numbers", group: "Logic & Sets", kw: "C complex imaginary" },

    // Calculus
    { tex: "\\sum", name: "sum", group: "Calculus", kw: "sigma summation series" },
    { tex: "\\prod", name: "product", group: "Calculus", kw: "pi product series" },
    { tex: "\\int", name: "integral", group: "Calculus", kw: "integrate calculus" },
    { tex: "\\iint", name: "double integral", group: "Calculus", kw: "surface integral" },
    { tex: "\\iiint", name: "triple integral", group: "Calculus", kw: "volume integral" },
    { tex: "\\oint", name: "contour integral", group: "Calculus", kw: "loop closed line integral" },
    { tex: "\\partial", name: "partial", group: "Calculus", kw: "derivative diff del d" },
    { tex: "\\nabla", name: "nabla / gradient", group: "Calculus", kw: "gradient grad div curl vector" },
    { tex: "\\infty", name: "infinity", group: "Calculus", kw: "inf infinite bound" },
    { tex: "\\lim", name: "limit", group: "Calculus", kw: "lim limit calculus" },
    { tex: "\\prime", name: "prime", group: "Calculus", kw: "' derivative prime f'" },

    // Linear Algebra
    { tex: "\\vec{}", name: "vector", group: "Linear Algebra", kw: "vec vector arrow" },
    { tex: "\\mathbf{}", name: "bold vector/matrix", group: "Linear Algebra", kw: "bold matrix vector tensor" },
    { tex: "\\hat{}", name: "unit vector", group: "Linear Algebra", kw: "hat unit vector i j k" },
    { tex: "\\det", name: "determinant", group: "Linear Algebra", kw: "det determinant matrix" },
    { tex: "\\operatorname{Tr}", name: "trace", group: "Linear Algebra", kw: "tr trace matrix" },
    { tex: "\\operatorname{rank}", name: "rank", group: "Linear Algebra", kw: "rank matrix span" },
    { tex: "\\operatorname{span}", name: "span", group: "Linear Algebra", kw: "span vector space" },
    { tex: "\\langle", name: "langle", group: "Linear Algebra", kw: "< inner product bra" },
    { tex: "\\rangle", name: "rangle", group: "Linear Algebra", kw: "> inner product ket" },

    // Physics & Chem
    { tex: "\\hbar", name: "h-bar", group: "Physics & Chem", kw: "planck constant quantum" },
    { tex: "\\mu_0", name: "permeability", group: "Physics & Chem", kw: "mu0 permeability em" },
    { tex: "\\varepsilon_0", name: "permittivity", group: "Physics & Chem", kw: "epsilon0 permittivity em" },
    { tex: "\\AA", name: "angstrom", group: "Physics & Chem", kw: "angstrom unit length" },
    { tex: "\\ce{}", name: "mhchem chemistry", group: "Physics & Chem", kw: "chemistry molecule reaction H2O" },
    { tex: "\\Delta E", name: "delta E", group: "Physics & Chem", kw: "energy change" },

    // Computer Science
    { tex: "\\mathcal{O}({})", name: "Big-O", group: "Computer Science", kw: "O big-o complexity" },
    { tex: "\\Theta({})", name: "Theta", group: "Computer Science", kw: "theta tight bound" },
    { tex: "\\Omega({})", name: "Omega", group: "Computer Science", kw: "omega lower bound" },
    { tex: "\\lfloor{}\\rfloor", name: "floor", group: "Computer Science", kw: "floor round down" },
    { tex: "\\lceil{}\\rceil", name: "ceiling", group: "Computer Science", kw: "ceil round up" },
    { tex: "\\bmod", name: "modulo", group: "Computer Science", kw: "mod remainder modulo" },
    { tex: "\\oplus", name: "XOR", group: "Computer Science", kw: "xor bitwise" },

    // Probability & Stats
    { tex: "\\mathbb{E}", name: "expectation", group: "Probability", kw: "expected value mean E" },
    { tex: "\\operatorname{Var}", name: "variance", group: "Probability", kw: "variance var sigma2" },
    { tex: "\\operatorname{Cov}", name: "covariance", group: "Probability", kw: "covariance cov" },
    { tex: "\\mathcal{N}", name: "Normal distribution", group: "Probability", kw: "normal gaussian distribution" },
    { tex: "\\sim", name: "distributed as", group: "Probability", kw: "distributed as random variable" },
    { tex: "\\binom{}{}", name: "binomial", group: "Probability", kw: "choose n choose k combinatorics" },
  ];

  function search(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return SYMBOLS.slice();
    return SYMBOLS.filter((s) => {
      return (
        s.tex.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.kw && s.kw.toLowerCase().includes(q)) ||
        s.group.toLowerCase().includes(q)
      );
    });
  }

  function byGroup(group) {
    if (!group) return SYMBOLS.slice();
    return SYMBOLS.filter((s) => s.group === group);
  }

  function find(tex) {
    return SYMBOLS.find((s) => s.tex === tex);
  }

  global.NotesMathData = {
    GROUPS,
    SYMBOLS,
    search,
    byGroup,
    find,
  };
})(window);
