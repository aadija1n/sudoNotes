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
    { tex: "\\alpha", name: "alpha", char: "α", group: "Greek", kw: "a greek" },
    { tex: "\\beta", name: "beta", char: "β", group: "Greek", kw: "b greek" },
    { tex: "\\gamma", name: "gamma", char: "γ", group: "Greek", kw: "g greek" },
    { tex: "\\delta", name: "delta", char: "δ", group: "Greek", kw: "d greek" },
    { tex: "\\epsilon", name: "epsilon", char: "ϵ", group: "Greek", kw: "e greek" },
    { tex: "\\varepsilon", name: "varepsilon", char: "ε", group: "Greek", kw: "e curly greek" },
    { tex: "\\zeta", name: "zeta", char: "ζ", group: "Greek", kw: "z greek" },
    { tex: "\\eta", name: "eta", char: "η", group: "Greek", kw: "h greek" },
    { tex: "\\theta", name: "theta", char: "θ", group: "Greek", kw: "th greek" },
    { tex: "\\vartheta", name: "vartheta", char: "ϑ", group: "Greek", kw: "th curly greek" },
    { tex: "\\iota", name: "iota", char: "ι", group: "Greek", kw: "i greek" },
    { tex: "\\kappa", name: "kappa", char: "κ", group: "Greek", kw: "k greek" },
    { tex: "\\lambda", name: "lambda", char: "λ", group: "Greek", kw: "l greek" },
    { tex: "\\mu", name: "mu", char: "μ", group: "Greek", kw: "m micro greek" },
    { tex: "\\nu", name: "nu", char: "ν", group: "Greek", kw: "n greek" },
    { tex: "\\xi", name: "xi", char: "ξ", group: "Greek", kw: "x greek" },
    { tex: "\\pi", name: "pi", char: "π", group: "Greek", kw: "p 3.14 greek" },
    { tex: "\\rho", name: "rho", char: "ρ", group: "Greek", kw: "r greek" },
    { tex: "\\sigma", name: "sigma", char: "σ", group: "Greek", kw: "s greek" },
    { tex: "\\tau", name: "tau", char: "τ", group: "Greek", kw: "t greek" },
    { tex: "\\upsilon", name: "upsilon", char: "υ", group: "Greek", kw: "u greek" },
    { tex: "\\phi", name: "phi", char: "ϕ", group: "Greek", kw: "f phi greek" },
    { tex: "\\varphi", name: "varphi", char: "φ", group: "Greek", kw: "phi curly greek" },
    { tex: "\\chi", name: "chi", char: "χ", group: "Greek", kw: "ch greek" },
    { tex: "\\psi", name: "psi", char: "ψ", group: "Greek", kw: "ps greek" },
    { tex: "\\omega", name: "omega", char: "ω", group: "Greek", kw: "w ohm greek" },

    // Greek Uppercase
    { tex: "\\Gamma", name: "Gamma", char: "Γ", group: "Greek", kw: "G greek upper" },
    { tex: "\\Delta", name: "Delta", char: "Δ", group: "Greek", kw: "D triangle greek upper" },
    { tex: "\\Theta", name: "Theta", char: "Θ", group: "Greek", kw: "Th greek upper" },
    { tex: "\\Lambda", name: "Lambda", char: "Λ", group: "Greek", kw: "L greek upper" },
    { tex: "\\Xi", name: "Xi", char: "Ξ", group: "Greek", kw: "X greek upper" },
    { tex: "\\Pi", name: "Pi", char: "Π", group: "Greek", kw: "P product greek upper" },
    { tex: "\\Sigma", name: "Sigma", char: "Σ", group: "Greek", kw: "S sum greek upper" },
    { tex: "\\Upsilon", name: "Upsilon", char: "Υ", group: "Greek", kw: "U greek upper" },
    { tex: "\\Phi", name: "Phi", char: "Φ", group: "Greek", kw: "Ph greek upper" },
    { tex: "\\Psi", name: "Psi", char: "Ψ", group: "Greek", kw: "Ps greek upper" },
    { tex: "\\Omega", name: "Omega", char: "Ω", group: "Greek", kw: "O ohm greek upper" },

    // Operators
    { tex: "\\pm", name: "plus-minus", char: "±", group: "Operators", kw: "+- plus minus" },
    { tex: "\\mp", name: "minus-plus", char: "∓", group: "Operators", kw: "-+ minus plus" },
    { tex: "\\times", name: "times", char: "×", group: "Operators", kw: "* multiply cross" },
    { tex: "\\div", name: "divide", char: "÷", group: "Operators", kw: "/ division" },
    { tex: "\\cdot", name: "cdot", char: "·", group: "Operators", kw: ". dot product multiply" },
    { tex: "\\circ", name: "circle", char: "∘", group: "Operators", kw: "deg degree compose circle" },
    { tex: "\\oplus", name: "oplus", char: "⊕", group: "Operators", kw: "xor direct sum plus circle" },
    { tex: "\\otimes", name: "otimes", char: "⊗", group: "Operators", kw: "tensor product times circle" },
    { tex: "\\odot", name: "odot", char: "⊙", group: "Operators", kw: "dot circle" },
    { tex: "\\star", name: "star", char: "⋆", group: "Operators", kw: "star asterisk" },
    { tex: "\\ast", name: "asterisk", char: "∗", group: "Operators", kw: "asterisk star" },
    { tex: "\\bullet", name: "bullet", char: "•", group: "Operators", kw: "bullet point" },
    { tex: "\\dagger", name: "dagger", char: "†", group: "Operators", kw: "dagger adjoint" },

    // Relations
    { tex: "\\le", name: "less than or equal", char: "≤", group: "Relations", kw: "<= leq less equal" },
    { tex: "\\ge", name: "greater than or equal", char: "≥", group: "Relations", kw: ">= geq greater equal" },
    { tex: "\\ne", name: "not equal", char: "≠", group: "Relations", kw: "!= neq not equal" },
    { tex: "\\approx", name: "approx", char: "≈", group: "Relations", kw: "~= estimate almost equal" },
    { tex: "\\equiv", name: "equivalent", char: "≡", group: "Relations", kw: "=== identity mod congruence" },
    { tex: "\\sim", name: "similar", char: "∼", group: "Relations", kw: "~ tilde proportional" },
    { tex: "\\propto", name: "proportional", char: "∝", group: "Relations", kw: "proportional to" },
    { tex: "\\ll", name: "much less", char: "≪", group: "Relations", kw: "<< much less than" },
    { tex: "\\gg", name: "much greater", char: "≫", group: "Relations", kw: ">> much greater than" },
    { tex: "\\cong", name: "congruent", char: "≅", group: "Relations", kw: "congruent isomorphic" },
    { tex: "\\perp", name: "perpendicular", char: "⊥", group: "Relations", kw: "orthogonal perp normal" },
    { tex: "\\parallel", name: "parallel", char: "∥", group: "Relations", kw: "parallel lines" },

    // Arrows
    { tex: "\\to", name: "to / rightarrow", char: "→", group: "Arrows", kw: "-> right arrow implies" },
    { tex: "\\leftarrow", name: "leftarrow", char: "←", group: "Arrows", kw: "<- left arrow" },
    { tex: "\\leftrightarrow", name: "leftrightarrow", char: "↔", group: "Arrows", kw: "<-> left right arrow" },
    { tex: "\\Rightarrow", name: "implies", char: "⇒", group: "Arrows", kw: "=> double right arrow implies" },
    { tex: "\\Leftarrow", name: "implied by", char: "⇐", group: "Arrows", kw: "<= double left arrow" },
    { tex: "\\Leftrightarrow", name: "iff", char: "⇔", group: "Arrows", kw: "<=> if and only if equivalent" },
    { tex: "\\mapsto", name: "maps to", char: "↦", group: "Arrows", kw: "|-> mapsto function" },
    { tex: "\\uparrow", name: "up arrow", char: "↑", group: "Arrows", kw: "^ up" },
    { tex: "\\downarrow", name: "down arrow", char: "↓", group: "Arrows", kw: "v down" },
    { tex: "\\longleftrightarrow", name: "long left right", char: "⟷", group: "Arrows", kw: "long arrow" },
    { tex: "\\rightleftharpoons", name: "equilibrium", char: "⇌", group: "Arrows", kw: "equilibrium reaction chem" },

    // Logic & Sets
    { tex: "\\forall", name: "for all", char: "∀", group: "Logic & Sets", kw: "universal quantifier forall" },
    { tex: "\\exists", name: "exists", char: "∃", group: "Logic & Sets", kw: "existential quantifier exists" },
    { tex: "\\neg", name: "not", char: "¬", group: "Logic & Sets", kw: "not negation logic" },
    { tex: "\\land", name: "and", char: "∧", group: "Logic & Sets", kw: "and conjunction logic wedge" },
    { tex: "\\lor", name: "or", char: "∨", group: "Logic & Sets", kw: "or disjunction logic vee" },
    { tex: "\\in", name: "in", char: "∈", group: "Logic & Sets", kw: "element of member belongs" },
    { tex: "\\notin", name: "not in", char: "∉", group: "Logic & Sets", kw: "not element of" },
    { tex: "\\subset", name: "subset", char: "⊂", group: "Logic & Sets", kw: "subset proper" },
    { tex: "\\subseteq", name: "subset or equal", char: "⊆", group: "Logic & Sets", kw: "subset equal" },
    { tex: "\\supset", name: "superset", char: "⊃", group: "Logic & Sets", kw: "superset" },
    { tex: "\\supseteq", name: "superset or equal", char: "⊇", group: "Logic & Sets", kw: "superset equal" },
    { tex: "\\cup", name: "union", char: "∪", group: "Logic & Sets", kw: "union cup or" },
    { tex: "\\cap", name: "intersection", char: "∩", group: "Logic & Sets", kw: "intersection cap and" },
    { tex: "\\setminus", name: "set difference", char: "∖", group: "Logic & Sets", kw: "\\ without minus set" },
    { tex: "\\emptyset", name: "empty set", char: "∅", group: "Logic & Sets", kw: "empty null set void" },
    { tex: "\\mathbb{N}", name: "Natural numbers", char: "ℕ", group: "Logic & Sets", kw: "N natural numbers" },
    { tex: "\\mathbb{Z}", name: "Integers", char: "ℤ", group: "Logic & Sets", kw: "Z integers" },
    { tex: "\\mathbb{Q}", name: "Rational numbers", char: "ℚ", group: "Logic & Sets", kw: "Q rationals fraction" },
    { tex: "\\mathbb{R}", name: "Real numbers", char: "ℝ", group: "Logic & Sets", kw: "R real numbers continuum" },
    { tex: "\\mathbb{C}", name: "Complex numbers", char: "ℂ", group: "Logic & Sets", kw: "C complex imaginary" },

    // Calculus
    { tex: "\\sum", name: "sum", char: "∑", group: "Calculus", kw: "sigma summation series" },
    { tex: "\\prod", name: "product", char: "∏", group: "Calculus", kw: "pi product series" },
    { tex: "\\int", name: "integral", char: "∫", group: "Calculus", kw: "integrate calculus" },
    { tex: "\\iint", name: "double integral", char: "∬", group: "Calculus", kw: "surface integral" },
    { tex: "\\iiint", name: "triple integral", char: "∭", group: "Calculus", kw: "volume integral" },
    { tex: "\\oint", name: "contour integral", char: "∮", group: "Calculus", kw: "loop closed line integral" },
    { tex: "\\partial", name: "partial", char: "∂", group: "Calculus", kw: "derivative diff del d" },
    { tex: "\\nabla", name: "nabla / gradient", char: "∇", group: "Calculus", kw: "gradient grad div curl vector" },
    { tex: "\\infty", name: "infinity", char: "∞", group: "Calculus", kw: "inf infinite bound" },
    { tex: "\\lim", name: "limit", char: "lim", group: "Calculus", kw: "lim limit calculus" },
    { tex: "\\prime", name: "prime", char: "′", group: "Calculus", kw: "' derivative prime f'" },

    // Linear Algebra
    { tex: "\\vec{}", name: "vector", char: "v⃗", group: "Linear Algebra", kw: "vec vector arrow" },
    { tex: "\\mathbf{}", name: "bold vector/matrix", char: "𝐗", group: "Linear Algebra", kw: "bold matrix vector tensor" },
    { tex: "\\hat{}", name: "unit vector", char: "û", group: "Linear Algebra", kw: "hat unit vector i j k" },
    { tex: "\\det", name: "determinant", char: "det", group: "Linear Algebra", kw: "det determinant matrix" },
    { tex: "\\operatorname{Tr}", name: "trace", char: "Tr", group: "Linear Algebra", kw: "tr trace matrix" },
    { tex: "\\operatorname{rank}", name: "rank", char: "rk", group: "Linear Algebra", kw: "rank matrix span" },
    { tex: "\\operatorname{span}", name: "span", char: "span", group: "Linear Algebra", kw: "span vector space" },
    { tex: "\\langle", name: "langle", char: "⟨", group: "Linear Algebra", kw: "< inner product bra" },
    { tex: "\\rangle", name: "rangle", char: "⟩", group: "Linear Algebra", kw: "> inner product ket" },

    // Physics & Chem
    { tex: "\\hbar", name: "h-bar", char: "ℏ", group: "Physics & Chem", kw: "planck constant quantum" },
    { tex: "\\mu_0", name: "permeability", char: "μ₀", group: "Physics & Chem", kw: "mu0 permeability em" },
    { tex: "\\varepsilon_0", name: "permittivity", char: "ε₀", group: "Physics & Chem", kw: "epsilon0 permittivity em" },
    { tex: "\\AA", name: "angstrom", char: "Å", group: "Physics & Chem", kw: "angstrom unit length" },
    { tex: "\\ce{}", name: "mhchem chemistry", char: "H₂O", group: "Physics & Chem", kw: "chemistry molecule reaction H2O" },
    { tex: "\\Delta E", name: "delta E", char: "ΔE", group: "Physics & Chem", kw: "energy change" },

    // Computer Science
    { tex: "\\mathcal{O}({})", name: "Big-O", char: "𝒪(n)", group: "Computer Science", kw: "O big-o complexity" },
    { tex: "\\Theta({})", name: "Theta", char: "Θ(n)", group: "Computer Science", kw: "theta tight bound" },
    { tex: "\\Omega({})", name: "Omega", char: "Ω(n)", group: "Computer Science", kw: "omega lower bound" },
    { tex: "\\lfloor{}\\rfloor", name: "floor", char: "⌊x⌋", group: "Computer Science", kw: "floor round down" },
    { tex: "\\lceil{}\\rceil", name: "ceiling", char: "⌈x⌉", group: "Computer Science", kw: "ceil round up" },
    { tex: "\\bmod", name: "modulo", char: "mod", group: "Computer Science", kw: "mod remainder modulo" },
    { tex: "\\oplus", name: "XOR", char: "⊕", group: "Computer Science", kw: "xor bitwise" },

    // Probability & Stats
    { tex: "\\mathbb{E}", name: "expectation", char: "𝔼", group: "Probability", kw: "expected value mean E" },
    { tex: "\\operatorname{Var}", name: "variance", char: "Var", group: "Probability", kw: "variance var sigma2" },
    { tex: "\\operatorname{Cov}", name: "covariance", char: "Cov", group: "Probability", kw: "covariance cov" },
    { tex: "\\mathcal{N}", name: "Normal distribution", char: "𝒩", group: "Probability", kw: "normal gaussian distribution" },
    { tex: "\\sim", name: "distributed as", char: "∼", group: "Probability", kw: "distributed as random variable" },
    { tex: "\\binom{}{}", name: "binomial", char: "(ⁿₖ)", group: "Probability", kw: "choose n choose k combinatorics" },
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
