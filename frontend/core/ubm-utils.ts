// eslint-disable-next-line import/prefer-default-export
export function recordToStr(r?: MutationRecord) {
    if (!r) {
        return null;
    }
    let str = `${r.type}:`;
    try {
        if (r.type === 'attributes') {
            str += `${r.target.toString()}\n`;
            str += `${r.attributeName}=>${(r.target as HTMLElement).getAttribute(r.attributeName!)}`;
        } else if (r.type === 'characterData') {
            str += (r.target as Text).data;
        } else if (r.type === 'childList') {
            if (r.removedNodes) {
                str += r.removedNodes[0];
            }
            if (r.addedNodes) {
                str += r.addedNodes[0];
            }
        }
        return str;
    } catch (e) {
        return r;
    }
}

export function isElementVisible(elem: HTMLElement) {
    if (!elem) {
        return true;
    }
    return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
}

export function insertAsFirst(newNode: Node, parentNode: Node) {
    if (parentNode.firstChild) {
        parentNode.insertBefore(newNode, parentNode.firstChild);
    } else {
        parentNode.appendChild(newNode);
    }
}

export function insertAfter(newNode: Node, targetNode: Node) {
    const parentEl = targetNode.parentNode;
    if (!parentEl) {
        console.error('Failed to find parent node for targetEl', targetNode);
        return;
    }
    if (parentEl.lastChild === targetNode) {
        parentEl.appendChild(newNode);
    } else {
        parentEl.insertBefore(newNode, targetNode.nextSibling);
    }
}

export function normalizePercentage(numerator: number, denominator: number){
    if(denominator === 0){
        return 0;
    }
    return +Number(numerator / denominator * 100)
        .toFixed(2);
}
