$(document).ready(function () {
    $('.modal').modal();
});

$(".button-collapse").sideNav();
$('.carousel.carousel-slider').carousel({ fullWidth: true, indicators: true });

$(".menu-link").click(function () {
    // Menu
    $(".menu-li").removeClass("active");
    $(this).parent().addClass("active");

    // Content
    $(".content").addClass("hide");
    $(".content").removeClass("show");
    $("#" + $(this).data("toggle")).removeClass("hide");
    $("#" + $(this).data("toggle")).addClass("show");
});

// Email obfuscation
function rot13(s) {
    return (s ? s : this).split('').map(function (_) {
        if (!_.match(/[A-Za-z]/)) return _;
        c = Math.floor(_.charCodeAt(0) / 97);
        k = (_.toLowerCase().charCodeAt(0) - 83) % 26 || 26;
        return String.fromCharCode(k + ((c == 0) ? 64 : 96));
    }).join('');
}
$("#email").attr("href", "mailto:" + rot13("gnavfud@gnavfudnttnejny.pbz"));