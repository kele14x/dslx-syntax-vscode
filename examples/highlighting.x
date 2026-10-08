import std;

type Word = u32;
const WIDTH = u32:8;

struct Packet {
    payload: uN[WIDTH],
    valid: bool,
}

enum Mode : u2 {
    IDLE = 0,
    ACTIVE = 1,
}

fn widen_add(left: u8, right: u8) -> u9 {
    // Widen before adding to retain the carry bit.
    (left as u9) + (right as u9)
}

fn identity<N: u32>(value: uN[N]) -> uN[N] {
    value
}

fn pack(packet: Packet) -> u9 {
    packet.valid ++ packet.payload
}

#[test]
fn arithmetic_test() {
    let value = u8:0b1010_0011;
    let value' = value ^ u8:0xff;
    let letter = 'A';
    assert_eq(letter, u8:0x41);
    assert_eq(identity<u32:8>(value'), u8:0x5c);
    assert_eq(widen_add(u8:255, u8:1), u9:256);
    trace_fmt!("value={}\n", value');
}

#[quickcheck]
fn identity_property(value: u32) -> bool {
    identity<u32:32>(value) == value
}

#[extern_verilog(template = `
    adder {inst} (.a({a}), .b({b}), .out({return}));
`)]
fn external_add(a: u32, b: u32) -> u32 {
    a + b
}

proc Counter {
    output: chan<u32> out;

    config(output: chan<u32> out) {
        (output,)
    }

    init { u32:0 }

    next(state: u32) {
        send(join(), output, state);
        state + u32:1
    }
}
