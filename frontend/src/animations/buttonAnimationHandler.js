import { buttonsBehavior } from "../utils/index.js";

let curButtonElement = null;

for (const id in buttonsBehavior) {
    const button = document.getElementById(id);
    const { event, className, animation } = buttonsBehavior[id];

    button.addEventListener(event, () => {
        if(!curButtonElement) {
            const alreadyExists = document.querySelector(`.${className}`);
            if(alreadyExists) alreadyExists.classList.remove(className);
        }
        if(curButtonElement) curButtonElement.classList.remove(className);
        button.classList.add(className);
        const animationInstance = button.animate(...animation);

        animationInstance.onfinish = () => {
            animationInstance.commitStyles();
            animationInstance.cancel();
        }

        curButtonElement = button;
    })
}