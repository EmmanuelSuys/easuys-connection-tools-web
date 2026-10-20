export function zeros(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
}
export function dot(a, b) {
    let value = 0;
    for (let i = 0; i < a.length; i++)
        value += a[i] * b[i];
    return value;
}
export function solveDense(a, b) {
    const n = b.length;
    const m = a.map((row, i) => [...row, b[i]]);
    for (let k = 0; k < n; k++) {
        let pivot = k;
        for (let i = k + 1; i < n; i++)
            if (Math.abs(m[i][k]) > Math.abs(m[pivot][k]))
                pivot = i;
        if (Math.abs(m[pivot][k]) < 1e-30)
            throw new Error("Singular dense matrix");
        [m[k], m[pivot]] = [m[pivot], m[k]];
        const d = m[k][k];
        for (let j = k; j <= n; j++)
            m[k][j] = m[k][j] / d;
        for (let i = 0; i < n; i++)
            if (i !== k) {
                const f = m[i][k];
                if (f !== 0)
                    for (let j = k; j <= n; j++)
                        m[i][j] = m[i][j] - f * m[k][j];
            }
    }
    return m.map(row => row[n]);
}
export function multiply(a, b) {
    const out = zeros(a.length, b[0]?.length ?? 0);
    for (let i = 0; i < a.length; i++)
        for (let k = 0; k < b.length; k++) {
            const aik = a[i][k];
            for (let j = 0; j < (b[k]?.length ?? 0); j++)
                out[i][j] += aik * b[k][j];
        }
    return out;
}
export function transpose(a) {
    return Array.from({ length: a[0]?.length ?? 0 }, (_, j) => a.map(row => row[j]));
}
export function reverseCuthillMcKee(adjacency) {
    const n = adjacency.length;
    const seen = new Uint8Array(n);
    const order = [];
    while (order.length < n) {
        let start = -1;
        for (let i = 0; i < n; i++)
            if (!seen[i] && (start < 0 || adjacency[i].size < adjacency[start].size))
                start = i;
        const queue = [start];
        seen[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            const u = queue[head];
            order.push(u);
            const next = [...adjacency[u]].filter(v => !seen[v]).sort((a, b) => adjacency[a].size - adjacency[b].size || a - b);
            for (const v of next)
                if (!seen[v]) {
                    seen[v] = 1;
                    queue.push(v);
                }
        }
    }
    order.reverse();
    return order;
}
export function createSkyline(firstRow) {
    const n = firstRow.length;
    const first = Int32Array.from(firstRow);
    const offset = new Int32Array(n + 1);
    for (let j = 0; j < n; j++)
        offset[j + 1] = offset[j] + j - first[j] + 1;
    return { size: n, firstRow: first, offset, values: new Float64Array(offset[n]) };
}
export function skylineAdd(a, row, col, value) {
    if (row > col)
        [row, col] = [col, row];
    if (row < a.firstRow[col])
        return;
    a.values[a.offset[col] + row - a.firstRow[col]] += value;
}
export function skylineGet(a, row, col) {
    if (row > col)
        [row, col] = [col, row];
    if (row < a.firstRow[col])
        return 0;
    return a.values[a.offset[col] + row - a.firstRow[col]];
}
/** In-place skyline Cholesky followed by forward/back substitution. */
export function solveSkyline(a, rhs) {
    const n = a.size;
    const v = a.values;
    const first = a.firstRow;
    const off = a.offset;
    const scale = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const diagonal = v[off[i + 1] - 1];
        if (!(diagonal > 0) || !Number.isFinite(diagonal))
            throw new Error(`Non-positive skyline diagonal at ${i}: ${diagonal}`);
        scale[i] = Math.sqrt(diagonal);
    }
    for (let j = 0; j < n; j++)
        for (let i = first[j]; i <= j; i++) {
            const index = off[j] + i - first[j];
            v[index] /= scale[i] * scale[j];
        }
    for (let j = 0; j < n; j++) {
        const fj = first[j];
        for (let i = fj; i < j; i++) {
            let x = v[off[j] + i - fj];
            const fk = Math.max(fj, first[i]);
            // U(k,i) is stored in column i (row k), U(k,j) in column j
            for (let k = fk; k < i; k++)
                x -= v[off[i] + k - first[i]] * v[off[j] + k - fj];
            const d = v[off[i + 1] - 1];
            if (!(d > 0) || !Number.isFinite(d))
                throw new Error(`Non-positive skyline pivot at ${i}: ${d}`);
            v[off[j] + i - fj] = x / d;
        }
        let diagonal = v[off[j + 1] - 1];
        for (let k = fj; k < j; k++) {
            const x = v[off[j] + k - fj];
            diagonal -= x * x;
        }
        if (!(diagonal > Math.max(1e-20, Math.abs(v[off[j + 1] - 1]) * 1e-14)) || !Number.isFinite(diagonal)) {
            throw new Error(`Non-positive skyline pivot at ${j}: ${diagonal}`);
        }
        v[off[j + 1] - 1] = Math.sqrt(diagonal);
    }
    const x = Array.from(rhs, (value, i) => value / scale[i]);
    for (let i = 0; i < n; i++) {
        for (let k = first[i]; k < i; k++)
            x[i] -= v[off[i] + k - first[i]] * x[k];
        x[i] /= v[off[i + 1] - 1];
    }
    for (let i = n - 1; i >= 0; i--) {
        x[i] /= v[off[i + 1] - 1];
        for (let r = first[i]; r < i; r++)
            x[r] -= v[off[i] + r - first[i]] * x[i];
    }
    for (let i = 0; i < n; i++)
        x[i] /= scale[i];
    return x;
}
