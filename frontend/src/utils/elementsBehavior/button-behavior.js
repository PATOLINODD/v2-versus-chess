import { animations } from "../animationKeyFrames.js";

export const buttonsBehavior = {
    changeToLogin: {
        event: "click",
        className: "tab-active",
        animation: animations.boxShadowFlash
    },
    changeTosignup: {
        event: "click",
        className: "tab-active",
        animation: animations.boxShadowFlash
    }
}