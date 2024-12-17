export type LensIdentifier = "pregnancy-lens" | "conditions-lens" | "allergyintollerance-lens" | "interaction-lens" | "diabetes-lens" | "default";
export type Language = "en" | "es" | "pt" | "da";

export const explanation: { [key in LensIdentifier]: { [key in Language]: string[] | string } } = {
    "pregnancy-lens": {
        "en": "This section was highlighted because you are a female of 18+ years, and this section refers to potential issues with pregnancy or breastfeeding.",
        "es": "Esta sección fue resaltada porque usted es una mujer de 18+ años, y esta sección se refiere a posibles problemas con el embarazo o la lactancia.",
        "pt": "Esta seção foi destacada porque você é uma mulher com mais de 18 anos e esta seção refere-se a potenciais problemas relacionados à gravidez ou amamentação.",
        "da": "Denne sektion blev fremhævet, fordi du er en kvinde over 18 år, og denne sektion henviser til potentielle problemer med graviditet eller amning."
    },
    "conditions-lens": {
        "en": ["This section was highlighted because you have stated in your clinical summary the diagnostic of ", "some conditions."],
        "es": ["Esta sección fue resaltada porque usted ha declarado en su resumen clínico el diagnóstico de ", "algunas condiciones."],
        "pt": ["Esta seção foi destacada porque você declarou no seu sumário clínico o diagnóstico de ", "algumas condições."],
        "da": ["Denne sektion blev fremhævet, fordi du har angivet i dit kliniske resumé diagnosen ", "nogle tilstande."]
    },
    "allergyintollerance-lens": {
        "en": [
            "This section was highlighted because you have stated in your clinical summary an ",
            " to ",
            "allergy or intolerance",
            "some agent."
        ],
        "es": [
            "Esta sección fue resaltada porque usted ha declarado en su resumen clínico una ",
            " a ",
            "alergia o intolerancia",
            "algun agente."
        ],
        "pt": [
            "Esta seção foi destacada porque você declarou no seu sumário clínico uma ",
            " a ",
            "alergia ou intolerância",
            "algum agente."
        ],
        "da": [
            "Denne sektion blev fremhævet, fordi du har angivet i dit kliniske resumé en ",
            " over for ",
            "allergi eller intolerance",
            "noget middel."
        ]
    },
    // "interaction-lens": {
    //     "en": [
    //         "This section was highlighted because you have stated in your clinical summary that you are taking ",
    //         " which is counter-indicated with "
    //     ],
    //     "es": [
    //         "Esta sección fue destacada porque has indicado en tu resumen clínico que estás tomando ",
    //         " que está contraindicado con "
    //     ],
    //     "pt": [
    //         "Esta seção foi destacada porque você indicou no seu sumário clínico que está tomando ",
    //         " que é contraindicado com "
    //     ],
    //     "da": [
    //         "Denne sektion blev fremhævet, fordi du har angivet i dit kliniske resumé, at du tager ",
    //         " som er kontraindiceret med "
    //     ]
    // },
    "interaction-lens": {
        "en": "This section was highlighted because you have stated in your clinical summary that you are taking medications that may interact with each other.",
        "es": "Esta sección fue resaltada porque ha indicado en su resumen clínico que está tomando medicamentos que pueden interactuar entre sí.",
        "pt": "Esta seção foi destacada porque você indicou no seu resumo clínico que está tomando medicamentos que podem interagir entre si.",
        "da": "Denne sektion blev fremhævet, fordi du har angivet i dit kliniske resumé, at du tager medicin, der kan interagere med hinanden."
    },
    "default": {
        "en": "This section was highlighted because it is relevant to your health.",
        "es": "Esta sección fue resaltada porque es relevante para su salud.",
        "pt": "Esta seção foi destacada porque é relevante para a sua saúde.",
        "da": "Denne sektion blev fremhævet, fordi den er relevant for din sundhed."
    },
    "diabetes-lens": {
        "en": "",
        "es": "",
        "pt": "",
        "da": ""
    }
}