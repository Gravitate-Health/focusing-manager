/*
  Input data
    These variables are automatically populated by the lens execution environment.
*/
// ePI data
let epiData = epi;
// IPS data
let ipsData = ips;
// PV data (for future use)
let pvData = pv;
// Original HTML content to be transformed
let htmlData = html;


/* 
    Enhance function: Transforms the original content to highlight specific sections.
    Input: htmlData (string) - The original text content.
           ipsData (object) - The IPS resource data.
           pvData (object) - The PV resource data.
           epiData (object) - The ePI resource data.
    Output: transformedContent (string) - The modified text content with highlights.
*/
function enhance() { 
    // Find the last closing tag (typically </div>) and insert stamp before it
    const lastClosingTagIndex = htmlData.lastIndexOf('</');
    if (lastClosingTagIndex !== -1) {
        transformedContent = htmlData.substring(0, lastClosingTagIndex) + 
                           "<p>This ePI has been enhanced with the stamp lens.</p>" + 
                           htmlData.substring(lastClosingTagIndex);
    } else {
        // Fallback: if no closing tag found, just append
        transformedContent = htmlData + "<p>This ePI has been enhanced with the stamp lens.</p>";
    }
    return transformedContent;
}

/* 
    Explanation function: Provides an explanation for the lens's behavior.
    Output: explanationText (string) - A textual explanation.
*/
function explanation() {
    // Your explanation logic here
    var explanationText = "Added a stamp to indicate that this ePI has been enhanced with the stamp lens.";
    return explanationText;
}

return {
    enhance: enhance,
    explanation: explanation
};